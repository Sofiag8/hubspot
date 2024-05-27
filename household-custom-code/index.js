const hubspot = require("@hubspot/api-client");

const ASSOCIATION_TYPE_ID = 46;

const OBJECTS = {
  ACCOUNT_TYPE: "account",
  HOUSEHOLD_TYPE: "households",
};

class Hubspot {
  constructor() {
    this.client = new hubspot.Client({
      accessToken: process.env.token,
    });
  }

  async searchHousehold(householdNumber) {
    const searchCriteria = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "name",
              value: householdNumber,
              operator: "EQ",
            },
          ],
        },
      ],
      properties: ["hs_object_id", "name"],
      limit: 1,
    };

    const { results } = await this.client.crm.objects.searchApi.doSearch(
      "2-20639520",
      searchCriteria
    );
    return results;
  }

  async createHousehold(householdNumber) {
    return this.client.crm.objects.basicApi.create("2-20639520", {
      properties: {
        name: householdNumber,
      },
    });
  }

  async formatAssociation(householdRecordId, accountRecordId) {
    return {
      to: {
        id: householdRecordId,
      },
      from: {
        id: accountRecordId,
      },
      _from: {
        id: accountRecordId,
      },
      types: [
        {
          associationCategory: "USER_DEFINED",
          associationTypeId: ASSOCIATION_TYPE_ID,
        },
      ],
    };
  }

  async searchAssociationsBetweenAccountAndHousehold(accountRecordId) {
    const { results } = await this.client.crm.associations.v4.basicApi.getPage(
      OBJECTS.ACCOUNT_TYPE,
      accountRecordId,
      OBJECTS.HOUSEHOLD_TYPE
    );
    return results;
  }

  async deleteHouseholdAssociationFromAccount(
    accountRecordId,
    householdRecordId
  ) {
    await this.client.crm.associations.v4.basicApi.archive(
      OBJECTS.ACCOUNT_TYPE,
      accountRecordId,
      OBJECTS.HOUSEHOLD_TYPE,
      householdRecordId
    );
  }

  async associateAccountToHousehold(householdToAssociate) {
    await this.client.crm.associations.v4.batchApi.create(
      OBJECTS.ACCOUNT_TYPE,
      OBJECTS.HOUSEHOLD_TYPE,
      {
        inputs: householdToAssociate,
      }
    );
  }
}

exports.main = async (event, callback) => {
  try {
    if (event.fields) {
      const householdToAssociate = [];

      const hubspotClient = new Hubspot();
      const household = await hubspotClient.searchHousehold(
        event.fields.household
      );

      if (!household.length) {
        const createdHousehold = await hubspotClient.createHousehold(
          event.fields.household
        );
        householdToAssociate.push(
          await hubspotClient.formatAssociation(
            createdHousehold.id,
            event.object.objectId
          )
        );
      } else {
        householdToAssociate.push(
          await hubspotClient.formatAssociation(
            household[0].id,
            event.object.objectId
          )
        );
      }

      await hubspotClient.associateAccountToHousehold(householdToAssociate);

      const getType = {
        id: householdToAssociate[0].to.id,
        typeId: householdToAssociate[0].types[0].associationTypeId,
      };

      const associationsToHouseholds =
        await hubspotClient.searchAssociationsBetweenAccountAndHousehold(
          event.object.objectId
        );

      const householdToDeleteAssociation = [];
      if (associationsToHouseholds.length > 1) {
        const filteredAssociation = associationsToHouseholds.filter((result) =>
          result.associationTypes.some((associationType) =>
            [ASSOCIATION_TYPE_ID].includes(associationType.typeId)
          )
        );

        filteredAssociation.forEach((currentAssociations) => {
          if (
            currentAssociations.associationTypes.some(
              (associationType) => associationType.typeId === getType.typeId
            ) &&
            currentAssociations.toObjectId !== Number(getType.id)
          ) {
            householdToDeleteAssociation.push({
              householdId: currentAssociations.toObjectId,
              typeId: getType.typeId,
            });
          }
        });
      }

      if (householdToDeleteAssociation.length > 0) {
        householdToDeleteAssociation.forEach(async (householdToDeleteA) => {
          await hubspotClient.deleteHouseholdAssociationFromAccount(
            event.object.objectId,
            householdToDeleteA.householdId
          );
        });
      }
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
  callback({
    outputFields: {},
  });
};
