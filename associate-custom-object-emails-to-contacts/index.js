const hubspot = require("@hubspot/api-client");

const ASSOCIATION_TYPE_IDS = {
  EMAIL1: 95,
  EMAIL2: 97,
  ESOPWORKEMAIL: 93,
};

const OBJECTS = {
  ACCOUNT_TYPE: "accounts",
  CONTACT_TYPE: "contact",
};

function formatAssociationLabel(
  recordId,
  trigerredAccountFields,
  contactToAssociate
) {
  const { email } = contactToAssociate.properties;
  const associations = [];
  if (trigerredAccountFields?.email1?.toLowerCase() === email) {
    associations.push({
      associationCategory: "USER_DEFINED",
      associationTypeId: ASSOCIATION_TYPE_IDS.EMAIL1,
    });
  }

  if (trigerredAccountFields?.email2?.toLowerCase() === email) {
    associations.push({
      associationCategory: "USER_DEFINED",
      associationTypeId: ASSOCIATION_TYPE_IDS.EMAIL2,
    });
  }

  if (trigerredAccountFields?.esopworkemail?.toLowerCase() === email) {
    associations.push({
      associationCategory: "USER_DEFINED",
      associationTypeId: ASSOCIATION_TYPE_IDS.ESOPWORKEMAIL,
    });
  }
  return {
    to: {
      id: contactToAssociate.id,
    },
    from: {
      id: recordId,
    },
    _from: {
      id: recordId,
    },
    types: [
      {
        associationCategory: "USER_DEFINED",
        associationTypeId: 28481264,
      },
      ...associations,
    ],
  };
}

exports.main = async (event, callback) => {
  const hubspotClient = new hubspot.Client({
    accessToken: process.env.token,
  });
  try {
    if (event.fields) {
      const filterGroups = [
        {
          filters: [
            {
              propertyName: "email",
              operator: "IN",
              values: [
                event.fields.email1,
                event?.fields?.email2,
                event?.fields?.esopworkemail,
              ]
                .filter(Boolean)
                .map((v) => v.toLowerCase()),
            },
          ],
        },
      ];

      const searchCriteria = {
        limit: 100,
        filterGroups,
        properties: ["hs_object_id", "firstname", "email"],
      };
      hubspotClient.crm.contacts.searchApi
        .doSearch(searchCriteria)
        .then(async (searchContactsResponse) => {
          const contactsToCreate = [];
          const contactsToAssociate = [];
          if (JSON.stringify(searchContactsResponse.total) > 0) {
            searchContactsResponse.results.map((contact) => {
              const associationLabels = formatAssociationLabel(
                event.object.objectId,
                event.fields,
                contact
              );
              contactsToAssociate.push(associationLabels);
              return contactsToAssociate;
            });
          }

          Object.keys(event.fields).forEach((key) => {
            const found = searchContactsResponse?.results?.find(
              (c) => c.properties.email === event.fields[key].toLowerCase()
            );

            if (!found && key) {
              contactsToCreate.push({
                properties: {
                  email: event.fields[key],
                  firstname: event.fields[key],
                },
              });
            }
          });
          if (contactsToCreate.length) {
            const createdContacts =
              await hubspotClient.crm.contacts.batchApi.create({
                inputs: contactsToCreate,
              });
            createdContacts.results?.forEach((contact) => {
              const associationLabels = formatAssociationLabel(
                event.object.objectId,
                event.fields,
                contact
              );
              contactsToAssociate.push(associationLabels);
            });
          }

          // get the label type each contact to be associated has
          const getTypes = contactsToAssociate.map((contact) => ({
            id: contact.to.id,
            typeId: contact.types[1].associationTypeId,
          }));

          // get the current association between accounts and contacts
          const associationsToContacts =
            await hubspotClient.crm.associations.v4.basicApi.getPage(
              OBJECTS.ACCOUNT_TYPE,
              event.object.objectId,
              OBJECTS.CONTACT_TYPE
            );

          // filter the existing associations to get only those related to the three email fields
          const filteredResults = associationsToContacts.results.filter(
            (result) =>
              result.associationTypes.some((associationType) =>
                [
                  ASSOCIATION_TYPE_IDS.EMAIL1,
                  ASSOCIATION_TYPE_IDS.EMAIL2,
                  ASSOCIATION_TYPE_IDS.ESOPWORKEMAIL,
                ].includes(associationType.typeId)
              )
          );

          const contactsToDeleteAssociation = [];
          filteredResults.forEach((currentAssociations) => {
            getTypes.forEach((contactToAssociate) => {
              if (
                currentAssociations.associationTypes.some(
                  (associationType) =>
                    associationType.typeId === contactToAssociate.typeId
                ) &&
                currentAssociations.toObjectId !== Number(contactToAssociate.id)
              ) {
                contactsToDeleteAssociation.push({
                  contactId: currentAssociations.toObjectId,
                  typeId: contactToAssociate.typeId,
                });
              }
            });
          });

          contactsToDeleteAssociation.forEach(
            async (contactToDeleteAssociation) => {
              await hubspotClient.crm.associations.v4.basicApi.archive(
                OBJECTS.ACCOUNT_TYPE,
                event.object.objectId,
                OBJECTS.CONTACT_TYPE,
                contactToDeleteAssociation.contactId
              );
            }
          );

          await hubspotClient.crm.associations.v4.batchApi.create(
            OBJECTS.ACCOUNT_TYPE,
            OBJECTS.CONTACT_TYPE,
            {
              inputs: contactsToAssociate,
            }
          );
        })
        .catch();
    }
  } catch (err) {
    console.error(err);
    throw err;
  }

  callback({
    outputFields: {},
  });
};
