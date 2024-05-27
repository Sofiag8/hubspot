import React, { useState, useEffect } from "react";
import { Divider, Flex, Form, Select, hubspot } from "@hubspot/ui-extensions";
import { CrmActionButton } from "@hubspot/ui-extensions/crm";

hubspot.extend(({ context, runServerlessFunction, actions }) => (
  <Extension
    context={context}
    runServerless={runServerlessFunction}
    fetchProperties={actions.fetchCrmObjectProperties}
  />
));

const Extension = ({ context, runServerless, fetchProperties }) => {
  const [accountContacts, setAccountContacts] = useState([]);
  const [contactObjectId, setContactObjectId] = useState(null);

  const fetchAssociatedContacts = async (hs_object_id) => {
    const { response } = await runServerless({
      name: "fetchAssociatedContacts",
      parameters: {
        hs_object_id,
      },
    });
    return response;
  };

  useEffect(() => {
    try {
      (async () => {
        const accountProperties = await fetchProperties(["hs_object_id"]);
        if (!accountProperties.hs_object_id) return;

        const accountAssociatedContacts = await fetchAssociatedContacts(
          accountProperties.hs_object_id
        );
        setAccountContacts(accountAssociatedContacts);
      })();
    } catch (error) {
      return error;
    }
  }, [fetchProperties]);

  return (
    <>
      <Divider />
      <Form>
        <Select
          name="choosed-contact"
          description="Choose a contact"
          placeholder="Choose a contact"
          required={true}
          onChange={(value) => {
            setContactObjectId(value);
          }}
          options={accountContacts}
        />
      </Form>
      <Divider />
      <Flex direction="row" align="end" gap="small">
        <CrmActionButton
          actionType="SEND_EMAIL"
          actionContext={{
            objectTypeId: "0-1",
            objectId: contactObjectId,
          }}
          variant="secondary"
        >
          Send email
        </CrmActionButton>
      </Flex>
    </>
  );
};
