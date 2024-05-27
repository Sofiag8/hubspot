const hubspot = require("@hubspot/api-client");

const ASSOCIATION_TYPE_IDS = {
  // custom object 1 to activity
  EMAIL: 24,
  NOTE: 34,
  MEETING: 30,
  CALL: 26,
  TASK: 36,
  CUSTOM1: 38,
  CUSTOM2: 69,

  // custom object 2 to activity
  H_NOTE: 64,
  H_TASK: 54,
  H_EMAIL: 62,
  H_MEETING: 60,
  H_CALL: 56,
};

const OBJECTS_IDS = {
  CUSTOM1: "2-28481264",
  CUSOTM2: "2-30606290",
};

const OBJECTS = {
  CUSTOM1_TYPE: "accounts",
  CONTACT_TYPE: "contact",
  NOTE_TYPE: "note",
  TASK_TYPE: "task",
  MEETING_TYPE: "meeting",
  CALL_TYPE: "call",
  EMAIL_TYPE: "email",
  CUSTOM2_TYPE: "households",
};

class Hubspot {
  constructor(contactId) {
    this.client = new hubspot.Client({
      accessToken: process.env.token,
    });
    this.contactId = contactId;
  }

  // batch search function used by multiple activities (object type)
  async findAssociations(toObjectType) {
    let allAssociations = [];
    let after;
    try {
      while (true) {
        const response = await this.client.crm.associations.v4.batchApi.getPage(
          OBJECTS.CONTACT_TYPE,
          toObjectType,
          { inputs: [{ id: this.contactId, after }] }
        );
        const associations = response?.results;
        associations.forEach((association) => {
          allAssociations.push(...association.to);
        });

        if (response?.paging && response?.paging?.next) {
          after = response.paging.next.after;
        } else {
          break;
        }
      }
      return allAssociations;
    } catch (error) {
      error.message === "HTTP request failed"
        ? console.error(JSON.stringify(error.response, null, 2))
        : console.error(error);
    }
  }

  formatAssociationActivityToAccounts(
    recordId,
    activityRecord,
    associationTypeId
  ) {
    return {
      to: {
        id: recordId,
      },
      from: {
        id: activityRecord, // activity id
      },
      _from: {
        id: activityRecord, // activity id
      },
      types: [
        {
          associationCategory: "USER_DEFINED",
          associationTypeId: associationTypeId,
        },
      ],
    };
  }

  async createAssociationsInBatched(activityObjectType, activities) {
    const results = [];

    for (let i = 0; i < activities.length; i += 100) {
      const batch = activities.slice(i, i + 100);

      await this.associateAcitivitiesToCustom1(activityObjectType, batch);
    }

    return results;
  }

  async associateAcitivitiesToCustom1(activityObjectType, associations) {
    const result = await this.client.crm.associations.v4.batchApi.create(
      activityObjectType, // note, meeting, task...
      OBJECTS.ACCOUNT_TYPE,
      {
        inputs: associations,
      }
    );
    return result;
  }

  // CUSTOM2
  async getHouseholdsNumbers(recordsIds) {
    const ids = [];
    recordsIds.forEach((recordId) => {
      ids.push({ id: String(recordId) });
    });
    const { results } = await this.client.crm.objects.batchApi.read(
      OBJECTS_IDS.CUSTOM1,
      {
        inputs: ids,
        properties: ["somePropertie"],
      }
    );
    const result = [];
    results.forEach((account) => {
      if (account.properties.somePropertie) {
        result.push(account.properties.somePropertie);
      }
    });
    return result;
  }

  async getCustomObject2Ids(arrayOfValues) {
    const searchCriteria = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "someProperty",
              values: arrayOfValues,
              operator: "IN",
            },
          ],
        },
      ],
      properties: ["hs_object_id"],
    };
    const { results } = await this.client.crm.objects.searchApi.doSearch(
      OBJECTS_IDS.CUSOTM2,
      searchCriteria
    );
    const ids = [];
    results.forEach((household) => {
      ids.push(household.id);
    });
    return ids;
  }

  async createCustom2AssociationsInBatched(activityObjectType, activities) {
    for (let i = 0; i < activities.length; i += 100) {
      const batch = activities.slice(i, i + 100);

      await this.associateActivityToHouseholds(activityObjectType, batch);
    }
  }

  async associateActivityToCustom2(activityObjectType, associations) {
    const result = await this.client.crm.associations.v4.batchApi.create(
      activityObjectType, // note, meeting, task...
      OBJECTS.CUSTOM2_TYPE,
      {
        inputs: associations,
      }
    );
    return result;
  }
}

exports.main = async (event, callback) => {
  const tasksAssociationsToCreate = [];
  const notesAssociationsToCreate = [];
  const callsAssociationsToCreate = [];
  const emailsAssociationsToCreate = [];
  const meetingsAssociationsToCreate = [];

  const tasksCustom2AssociationsToCreate = [];
  const notesCustom2AssociationsToCreate = [];
  const callsCustom2AssociationsToCreate = [];
  const emailsCustom2AssociationsToCreate = [];
  const meetingsCustom2AssociationsToCreate = [];

  const hubspotClient = new Hubspot(event.object.objectId);

  // get the association to validate if contact has account associated and get the record/s
  const associationsFromContactToCustom1 = await hubspotClient.findAssociations(
    OBJECTS.CUSTOM1_TYPE
  );

  // only if the contact has accounts associated
  if (associationsFromContactToCustom1.length) {
    const custom1AssociatedIds = associationsFromContactToCustom1.map(
      (association) => association.toObjectId
    );

    const custom2Numbers = await hubspotClient.getHouseholdsNumbers(
      custom1AssociatedIds
    );
    const custom2RecordsIds = await hubspotClient.getHouseholdsIds(
      custom2Numbers
    );

    const [
      notesAssociations,
      meetingsAssociations,
      callsAssociations,
      emailAssociations,
      tasksAssociations,
    ] = await Promise.all([
      hubspotClient.findAssociations(OBJECTS.NOTE_TYPE),
      hubspotClient.findAssociations(OBJECTS.MEETING_TYPE),
      hubspotClient.findAssociations(OBJECTS.CALL_TYPE),
      hubspotClient.findAssociations(OBJECTS.EMAIL_TYPE),
      hubspotClient.findAssociations(OBJECTS.TASK_TYPE),
    ]);

    // format activities association for each associated account
    custom1AssociatedIds.forEach((associatedCustom1Id) => {
      notesAssociations.forEach((note) => {
        const noteToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            associatedCustom1Id,
            note.toObjectId,
            ASSOCIATION_TYPE_IDS.NOTE
          );
        notesAssociationsToCreate.push(noteToAccountAssociation);
      });

      meetingsAssociations.forEach((meeting) => {
        const meetingToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            associatedCustom1Id,
            meeting.toObjectId,
            ASSOCIATION_TYPE_IDS.MEETING
          );
        meetingsAssociationsToCreate.push(meetingToAccountAssociation);
      });

      callsAssociations.forEach((call) => {
        const callToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            associatedCustom1Id,
            call.toObjectId,
            ASSOCIATION_TYPE_IDS.CALL
          );
        callsAssociationsToCreate.push(callToAccountAssociation);
      });

      emailAssociations.forEach((email) => {
        const emailToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            associatedCustom1Id,
            email.toObjectId,
            ASSOCIATION_TYPE_IDS.EMAIL
          );
        emailsAssociationsToCreate.push(emailToAccountAssociation);
      });

      tasksAssociations.forEach((task) => {
        const taskToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            associatedCustom1Id,
            task.toObjectId,
            ASSOCIATION_TYPE_IDS.TASK
          );
        tasksAssociationsToCreate.push(taskToAccountAssociation);
      });
    });

    // Househol associations to acitivites
    custom2RecordsIds.forEach((recordId) => {
      notesAssociations.forEach((note) => {
        const noteToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            Number(recordId),
            note.toObjectId,
            ASSOCIATION_TYPE_IDS.H_NOTE
          );
        notesCustom2AssociationsToCreate.push(noteToAccountAssociation);
      });

      meetingsAssociations.forEach((meeting) => {
        const meetingToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            recordId,
            meeting.toObjectId,
            ASSOCIATION_TYPE_IDS.H_MEETING
          );
        meetingsCustom2AssociationsToCreate.push(meetingToAccountAssociation);
      });

      callsAssociations.forEach((call) => {
        const callToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            recordId,
            call.toObjectId,
            ASSOCIATION_TYPE_IDS.H_CALL
          );
        callsCustom2AssociationsToCreate.push(callToAccountAssociation);
      });

      emailAssociations.forEach((email) => {
        const emailToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            recordId,
            email.toObjectId,
            ASSOCIATION_TYPE_IDS.H_EMAIL
          );
        emailsCustom2AssociationsToCreate.push(emailToAccountAssociation);
      });

      tasksAssociations.forEach((task) => {
        const taskToAccountAssociation =
          hubspotClient.formatAssociationActivityToAccounts(
            recordId,
            task.toObjectId,
            ASSOCIATION_TYPE_IDS.H_TASK
          );
        tasksCustom2AssociationsToCreate.push(taskToAccountAssociation);
      });
    });

    // create associations per activity
    await Promise.all([
      hubspotClient.createAssociationsInBatched(
        OBJECTS.NOTE_TYPE,
        notesAssociationsToCreate
      ),
      hubspotClient.createAssociationsInBatched(
        OBJECTS.MEETING_TYPE,
        meetingsAssociationsToCreate
      ),
      hubspotClient.createAssociationsInBatched(
        OBJECTS.CALL_TYPE,
        callsAssociationsToCreate
      ),
      hubspotClient.createAssociationsInBatched(
        OBJECTS.EMAIL_TYPE,
        emailsAssociationsToCreate
      ),
      hubspotClient.createAssociationsInBatched(
        OBJECTS.TASK_TYPE,
        tasksAssociationsToCreate
      ),

      // to custom2
      hubspotClient.createCustom2AssociationsInBatched(
        OBJECTS.NOTE_TYPE,
        notesCustom2AssociationsToCreate
      ),
      hubspotClient.createCustom2AssociationsInBatched(
        OBJECTS.MEETING_TYPE,
        meetingsCustom2AssociationsToCreate
      ),
      hubspotClient.createCustom2AssociationsInBatched(
        OBJECTS.CALL_TYPE,
        callsCustom2AssociationsToCreate
      ),
      hubspotClient.createCustom2AssociationsInBatched(
        OBJECTS.EMAIL_TYPE,
        emailsCustom2AssociationsToCreate
      ),
      hubspotClient.createCustom2AssociationsInBatched(
        OBJECTS.TASK_TYPE,
        tasksCustom2AssociationsToCreate
      ),
    ]);
  }

  callback({
    outputFields: {},
  });
};
