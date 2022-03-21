import { IHookFunctions, IWebhookFunctions } from "n8n-core";

import { OptionsWithUri } from "request";

import axios from "axios";

import {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
  NodeOperationError,
  ICredentialsDecrypted,
  ICredentialTestFunctions,
  ILoadOptionsFunctions,
  INodeCredentialTestResult,
  INodePropertyOptions,
} from "n8n-workflow";

import {
  odooCreate,
  odooDelete,
  odooGet,
  odooGetDBName,
  odooGetUserID,
  odooJSONRPCRequest,
} from "./GenericFunctionsTrigger";

export class OdooTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Odoo Trigger",
    name: "odooTrigger",
    icon: "file:odoo.svg",
    group: ["trigger"],
    version: 1,
    description: "Handle Odoo events via webhooks",
    defaults: {
      name: "Odoo-Trigger",
    },
    inputs: [],
    outputs: ["main"],
    credentials: [
      {
        name: "odooApi",
        required: true,
      },
    ],
    webhooks: [
      {
        name: "default",
        httpMethod: "POST",
        responseMode: "onReceived",
        path: "webhook",
      },
    ],
    properties: [
      {
        displayName: "Resource",
        name: "resource",
        type: "options",
        default: "",
        typeOptions: {
          loadOptionsMethod: "getModels",
        },
        description: "The resource to operate on",
      },
      {
        displayName: "Trigger",
        name: "trigger",
        type: "options",
        default: "on_create",
        options: [
          { name: "On Create", value: "on_create" },
          { name: "On Update", value: "on_write" },
          { name: "On Create And Update", value: "on_creat_or_write" },
          { name: "On Delete", value: "on_unlink" },
        ],
        description: "The method the webhook should trigger.",
      },
    ],
  };

  methods = {
    loadOptions: {
      async getModels(
        this: ILoadOptionsFunctions
      ): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials("odooApi");
        const url = credentials?.url as string;
        const username = credentials?.username as string;
        const password = credentials?.password as string;
        const db = odooGetDBName(credentials?.db as string, url);
        const userID = await odooGetUserID.call(
          this,
          db,
          username,
          password,
          url
        );

        const body = {
          jsonrpc: "2.0",
          method: "call",
          params: {
            service: "object",
            method: "execute",
            args: [
              db,
              userID,
              password,
              "ir.model",
              "search_read",
              [],
              ["name", "model", "modules"],
            ],
          },
          id: Math.floor(Math.random() * 100),
        };
        // await axios.post(
        //   "https://webhook.site/114a3c49-c4f4-4fc2-8016-8f5999dc55c6",
        //   body
        // );
        // @ts-ignore
        const result = (
          await odooJSONRPCRequest.call(
            this,
            body,
            url
            )
            //@ts-ignore
        ).result as IDataObject[];
        // @ts-ignore
        const options = result.map((model) => {
          return {
            name: model.name,
            value: model.model,
            description: `model: ${model.model}<br> modules: ${model.modules}`,
          };
        });
        return options as INodePropertyOptions[];
      },
    },
    credentialTest: {
      async odooApiTest(
        this: ICredentialTestFunctions,
        credential: ICredentialsDecrypted
      ): Promise<INodeCredentialTestResult> {
        const credentials = credential.data;

        try {
          const body = {
            jsonrpc: "2.0",
            method: "call",
            params: {
              service: "common",
              method: "login",
              args: [
                odooGetDBName(
                  credentials?.db as string,
                  credentials?.url as string
                ),
                credentials?.username,
                credentials?.password,
              ],
            },
            id: Math.floor(Math.random() * 100),
          };

          const options: OptionsWithUri = {
            headers: {
              "User-Agent": "n8n",
              Connection: "keep-alive",
              Accept: "*/*",
              "Content-Type": "application/json",
            },
            method: "POST",
            body,
            uri: `${(credentials?.url as string).replace(/\/$/, "")}/jsonrpc`,
            json: true,
          };
          const result = await this.helpers.request!(options);
          if (result.error || !result.result) {
            return {
              status: "Error",
              message: `Credentials are not valid`,
            };
          } else if (result.error) {
            return {
              status: "Error",
              message: `Credentials are not valid: ${result.error.data.message}`,
            };
          }
        } catch (error) {
          return {
            status: "Error",
            message: `Settings are not valid: ${error}`,
          };
        }
        return {
          status: "OK",
          message: "Authentication successful!",
        };
      },
    },
  };

  // @ts-ignore (because of request)
  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        // Check all the webhooks which exist already if it is identical to the
        // one that is supposed to get created.
        const resource = "base.automation";

        const credentials = await this.getCredentials("odooApi");
        const url = credentials?.url as string;
        const username = credentials?.username as string;
        const password = credentials?.password as string;
        const db = odooGetDBName(credentials?.db as string, url);
        const userID = await odooGetUserID.call(
          this,
          db,
          username,
          password,
          url
        );

        // const webhookData = this.getWorkflowStaticData("node");
        // if (webhookData.webhookId === undefined) {
        //   return false;
        // }

        // const responseData = await odooGetAll.call(
        //   this,
        //   db,
        //   userID,
        //   password,
        //   resource,
        //   "getAll",
        //   url
        // );

        // // @ts-ignore
        // for (const webhook of responseData) {
        //   if (webhookData.webhookId === webhook.id) {
        //     return true;
        //   }
        // }
        return false;
      },
      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl("default") as string;
        const webhookData = this.getWorkflowStaticData("node");

        if (webhookUrl.includes("%20")) {
          throw new NodeOperationError(
            this.getNode(),
            "The name of the Odoo Trigger Node is not allowed to contain any spaces!"
          );
        }

        const resource = this.getNodeParameter("resource") as string;
        const trigger = this.getNodeParameter("trigger") as string;

        const credentials = await this.getCredentials("odooApi");
        const url = credentials?.url as string;
        const username = credentials?.username as string;
        const password = credentials?.password as string;
        const db = odooGetDBName(credentials?.db as string, url);
        const userID = await odooGetUserID.call(
          this,
          db,
          username,
          password,
          url
        );

        //@ts-ignore
        const response = odooCreate.call(
          this,
          db,
          userID,
          password,
          "base.automation",
          "create",
          url,
          {
            name: "Webhook generated by n8n",
            model_id: resource,
            state: "code",
            trigger: trigger,
            code: "print('test')",
          }
        );

        // const endpoint = "/webhook/subscribe";

        // const body = {
        //   webhook_url: webhookUrl,
        //   subscriptions: events,
        // };

        // const responseData = await odooApiRequest.call(this, 'POST', endpoint, body);

        // if (responseData.id === undefined) {
        // 	// Required data is missing so was not successful
        // 	return false;
        // }

        // const webhookData = this.getWorkflowStaticData('node');
        // webhookData.webhookId = responseData.id as string;
        return true;
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        // const webhookData = this.getWorkflowStaticData('node');
        // if (webhookData.webhookId !== undefined) {

        // 	const endpoint = `/webhook/${webhookData.webhookId}`;

        // 	const responseData = await odooApiRequest.call(this, 'DELETE', endpoint);

        // 	if (!responseData.success) {
        // 		return false;
        // 	}
        // 	// Remove from the static workflow data so that it is clear
        // 	// that no webhooks are registred anymore
        // 	delete webhookData.webhookId;
        // }
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const bodyData = this.getBodyData();

    //@ts-ignore
    let model = bodyData.content.split("(")[0];
    //@ts-ignore
    let id = bodyData.content.split("(")[1].split(",")[0];

    const credentials = await this.getCredentials("odooApi");
    const url = credentials?.url as string;
    const username = credentials?.username as string;
    const password = credentials?.password as string;
    const db = odooGetDBName(credentials?.db as string, url);
    const userID = await odooGetUserID.call(
      //@ts-ignore
      this,
      db,
      username,
      password,
      url
    );

    // @ts-ignore
    const response = odooGet.call(
      //@ts-ignore
      this,
      db,
      userID,
      password,
      model,
      "get",
      url,
      id
    );

    return {
      //@ts-ignore
      workflowData: [this.helpers.returnJsonArray(response)],
    };
  }
}
