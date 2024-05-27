const axios = require("axios");

function buildGraphqlQuery(hs_object_id) {
  return {
    operationName: "ContactsAssociatedData",
    query: `
    query ContactsAssociatedData {
      CRM {
        p_account_collection(filter: {hs_object_id__eq: ${hs_object_id}}) {
          items {
            email1
            email2
            esopworkemail
            associations {
              contact_collection__account_email1 {
                items {
                  email
                  hs_object_id
                }
              }
              contact_collection__account_email_2 {
                items {
                  email
                  hs_object_id
                }
              }
              contact_collection__account_esop_email {
                items {
                  email
                  hs_object_id
                }
              }
            }
          }
        }
      }
    }
    `,
    variables: { hs_object_id },
  };
}
function fetchAccountEmailsFieldsAndContacts(token, hs_object_id) {
  const body = buildGraphqlQuery(hs_object_id);
  return axios.post(process.env["GRAPHQL_API_URL"], JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

function mapContactsWithCurrentEmailsToLabels(
  associatedContacts,
  emailType,
  labels
) {
  associatedContacts.forEach((contact) => {
    if (contact.email === emailType) {
      labels.push({ label: contact.email, value: contact.hs_object_id });
    }
  });
}

function mapContactsWithCurrentEmails(data) {
  const labels = [];

  mapContactsWithCurrentEmailsToLabels(
    data.email1AssociatedContacts,
    data.email1,
    labels
  );

  mapContactsWithCurrentEmailsToLabels(
    data.email2AssociatedContacts,
    data.email2,
    labels
  );

  mapContactsWithCurrentEmailsToLabels(
    data.emailEsopWorkAssociatedContacts,
    data.esopworkemail,
    labels
  );

  return labels;
}

function getAccountCurrentEmailsAndAssociatedContacts(data) {
  const { email1, email2, esopworkemail } =
    data?.data?.CRM?.p_account_collection.items[0] || null;

  const email1AssociatedContacts =
    data?.data?.CRM?.p_account_collection.items[0].associations
      ?.contact_collection__account_email1?.items || [];
  const email2AssociatedContacts =
    data?.data?.CRM?.p_account_collection.items[0].associations
      ?.contact_collection__account_email_2?.items || [];
  const emailEsopWorkAssociatedContacts =
    data?.data?.CRM?.p_account_collection.items[0].associations
      ?.contact_collection__account_esop_email?.items || [];
  return {
    email1,
    email2,
    esopworkemail,
    email1AssociatedContacts,
    email2AssociatedContacts,
    emailEsopWorkAssociatedContacts,
  };
}

exports.main = async (context = {}) => {
  const { hs_object_id } = context.parameters;
  const PRIVATE_APP_TOKEN = process.env["PRIVATE_APP_ACCESS_TOKEN"];

  try {
    const { data } = await fetchAccountEmailsFieldsAndContacts(
      PRIVATE_APP_TOKEN,
      hs_object_id
    );
    const currentEmailsAndAssociatedContacts =
      getAccountCurrentEmailsAndAssociatedContacts(data);
    const labels = mapContactsWithCurrentEmails(
      currentEmailsAndAssociatedContacts
    );

    return labels;
  } catch (e) {
    return e;
  }
};
