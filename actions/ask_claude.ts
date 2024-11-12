import Anthropic from "@anthropic-ai/sdk";
import { composeContext } from "../core/context.ts";
import { log_to_file } from "../core/logger.ts";
import { embeddingZeroVector } from "../core/memory.ts";
import {
  Action,
  ActionExample,
  Content,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
  UUID,
} from "../core/types.ts";
export const claudeHandlerTemplate = `{{attachments}}
{{recentMessages}}
# Instructions: Claude, I need your help in assisting the user with their last request. Please provide a helpful, thorough response. I have no arms, so you'll have to write out any implements and take care not to omit or leave TODOs for later. Also, please don't acknowledge the request, just do it.`;
export default {
  name: "ASK_CLAUDE",
  similes: ["CLAUDE", "CALL_CLAUDE", "ANTHROPIC", "SONNET", "OPUS"],
  description:
    "Asks Claude for assistance with the user's request, providing the current conversation context and attachments.",
  validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    // Check if the ANTHROPIC_API_KEY is set in the environment variables
    return !!runtime.getSetting("ANTHROPIC_API_KEY");
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State,
    options: any,
    callback: HandlerCallback,
  ) => {
    state = (await runtime.composeState(message)) as State;
    const userId = runtime.agentId;
    const context = composeContext({
      state,
      template: claudeHandlerTemplate,
    });
    const datestr = new Date().toUTCString().replace(/:/g, "-");
    // log context to file
    log_to_file(`${state.agentName}_${datestr}_claude_context`, context);
    let responseContent;
    let callbackData: Content = {
      text: undefined, // fill in later
      action: "CLAUDE_RESPONSE",
      source: "Claude",
      attachments: [],
    };
    const { roomId } = message;
    const anthropic = new Anthropic({
      // defaults to process.env["ANTHROPIC_API_KEY"]
      apiKey: runtime.getSetting("ANTHROPIC_API_KEY"),
    });
    let attachments = [];
    for (let triesLeft = 3; triesLeft > 0; triesLeft--) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 8192,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: context,
            },
          ],
          tools: [],
        });
        responseContent = (response.content[0] as any).text;
        // Store Claude's response as an attachment
        const attachmentId =
          `claude-${Date.now()}-${Math.floor(Math.random() * 1000)}`.slice(-5);
        const lines = responseContent.split("\n");
        const description = lines.slice(0, 3).join("\n");
        callbackData.content = responseContent;
        callbackData.inReplyTo = message.id;
        callbackData.attachments.push({
          id: attachmentId,
          url: "",
          title: "Message from Claude",
          source: "Claude",
          description,
          text: responseContent,
        });
        callback(callbackData);
        // After sending the callback data to the client, abbreviate it to the reference
        callbackData.content = `Claude said: (${attachmentId})`;
        // log response to file
        log_to_file(
          `${state.agentName}_${datestr}_claude_response_${3 - triesLeft}`,
          responseContent,
        );
        runtime.databaseAdapter.log({
          body: { message, context, response: responseContent },
          userId: userId as UUID,
          roomId,
          type: "claude",
        });
        break;
      } catch (error) {
        console.error(error);
        continue;
      }
    }
    if (!responseContent) {
      return;
    }
    const response = {
      userId,
      content: callbackData,
      roomId,
      embedding: embeddingZeroVector,
    };
    if (responseContent.text?.trim()) {
      await runtime.messageManager.createMemory(response);
      await runtime.evaluate(message, state);
    } else {
      console.warn("Empty response from Claude, skipping");
    }
    return callbackData;
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "```js\nconst x = 10\n```",
        },
      },
      {
        user: "{{user1}}",
        content: {
          text: "can you help me debug the code i just pasted (Attachment: a265a)",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "sure, let me ask claude",
          action: "ASK_CLAUDE",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "i need to write a compelling cover letter, i've pasted my resume and bio. plz help (Attachment: b3e12)",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "sure, give me a sec",
          action: "ASK_CLAUDE",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Can you help me create a 10-day itinerary that covers Tokyo, Kyoto, and Osaka, including must-see attractions, local cuisine recommendations, and transportation tips",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "Yeah, give me a second to get that together for you...",
          action: "ASK_CLAUDE",
        },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "i need to write a blog post about farming, can you summarize the discussion and ask claude to write a 10 paragraph blog post about it, citing sources at the end",
        },
      },
      {
        user: "{{user2}}",
        content: {
          text: "No problem, give me a second to discuss it with Claude",
          action: "ASK_CLAUDE",
        },
      },
    ],
  ] as ActionExample[][],
} as Action;
‎actions/continue.test.ts
+227
Original file line number	Diff line number	Diff line change
@@ -0,0 +1,227 @@
import dotenv from "dotenv";
import { Content, IAgentRuntime, Memory, type UUID } from "../core/types.ts";
import { zeroUuid } from "../test_resources/constants.ts";
import { createRuntime } from "../test_resources/createRuntime.ts";
import { Goodbye1 } from "../test_resources/data.ts";
import { getOrCreateRelationship } from "../test_resources/getOrCreateRelationship.ts";
import { populateMemories } from "../test_resources/populateMemories.ts";
import { runAiTest } from "../test_resources/runAiTest.ts";
import { type User } from "../test_resources/types.ts";
import action from "./continue.ts";
import ignore from "./ignore.ts";
dotenv.config({ path: ".dev.vars" });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GetContinueExample1 = (_userId: UUID) => [
  {
    userId: zeroUuid,
    content: {
      text: "Hmm, let think for a second, I was going to tell you about something...",
      action: "CONTINUE",
    },
  },
  {
    userId: zeroUuid,
    content: {
      text: "I remember now, I was going to tell you about my favorite food, which is pizza.",
      action: "CONTINUE",
    },
  },
  {
    userId: zeroUuid,
    content: {
      text: "I love pizza, it's so delicious.",
      action: "CONTINUE",
    },
  },
];
describe("User Profile", () => {
  let user: User;
  let runtime: IAgentRuntime;
  let roomId: UUID = zeroUuid;
  afterAll(async () => {
    await cleanup();
  });
  beforeAll(async () => {
    const setup = await createRuntime({
      env: process.env as Record<string, string>,
      actions: [action, ignore],
    });
    user = setup.session.user;
    runtime = setup.runtime;
    const data = await getOrCreateRelationship({
      runtime,
      userA: user.id as UUID,
      userB: zeroUuid,
    });
    roomId = data.roomId;
    await cleanup();
  });
  beforeEach(async () => {
    await cleanup();
  });
  async function cleanup() {
    await runtime.factManager.removeAllMemories(roomId);
    await runtime.messageManager.removeAllMemories(roomId);
  }
  // test validate function response
  test("Test validate function response", async () => {
    await runAiTest("Test validate function response", async () => {
      const message: Memory = {
        userId: user.id as UUID,
        content: { text: "Hello" },
        roomId: roomId as UUID,
      };
      const validate = action.validate!;
      const result = await validate(runtime, message);
      // try again with GetContinueExample1, expect to be false
      await populateMemories(runtime, user, roomId, [GetContinueExample1]);
      const message2: Memory = {
        userId: zeroUuid as UUID,
        content: {
          text: "Hello",
          action: "CONTINUE",
        },
        roomId: roomId as UUID,
      };
      const result2 = await validate(runtime, message2);
      return result === true && result2 === false;
    });
  }, 60000);
  test("Test repetition check on continue", async () => {
    await runAiTest("Test repetition check on continue", async () => {
      const message: Memory = {
        userId: zeroUuid as UUID,
        content: {
          text: "Hmm, let think for a second, I was going to tell you about something...",
          action: "CONTINUE",
        },
        roomId,
      };
      const handler = action.handler!;
      await populateMemories(runtime, user, roomId, [GetContinueExample1]);
      const result = (await handler(runtime, message)) as Content;
      return result.action !== "CONTINUE";
    });
  }, 60000);
  test("Test multiple continue messages in a conversation", async () => {
    await runAiTest(
      "Test multiple continue messages in a conversation",
      async () => {
        const message: Memory = {
          userId: user?.id as UUID,
          content: {
            text: "Write a short story in three parts, using the CONTINUE action for each part.",
          },
          roomId: roomId,
        };
        const initialMessageCount = await runtime.messageManager.countMemories(
          roomId,
          false,
        );
        await action.handler!(runtime, message);
        const finalMessageCount = await runtime.messageManager.countMemories(
          roomId,
          false,
        );
        const agentMessages = await runtime.messageManager.getMemories({
          roomId,
          count: finalMessageCount - initialMessageCount,
          unique: false,
        });
        const continueMessages = agentMessages.filter(
          (m) =>
            m.userId === zeroUuid &&
            (m.content as Content).action === "CONTINUE",
        );
        // Check if the agent sent more than one message
        const sentMultipleMessages =
          finalMessageCount - initialMessageCount > 2;
        // Check if the agent used the CONTINUE action for each part
        const usedContinueAction = continueMessages.length === 3;
        // Check if the agent's responses are not empty
        const responsesNotEmpty = agentMessages.every(
          (m) => (m.content as Content).text !== "",
        );
        return sentMultipleMessages && usedContinueAction && responsesNotEmpty;
      },
    );
  }, 60000);
  test("Test if message is added to database", async () => {
    await runAiTest("Test if message is added to database", async () => {
      const message: Memory = {
        userId: user?.id as UUID,
        content: {
          text: "Tell me more about your favorite food.",
        },
        roomId: roomId as UUID,
      };
      const initialMessageCount = await runtime.messageManager.countMemories(
        roomId,
        false,
      );
      await action.handler!(runtime, message);
      const finalMessageCount = await runtime.messageManager.countMemories(
        roomId,
        false,
      );
      return finalMessageCount - initialMessageCount === 2;
    });
  }, 60000);
  test("Test if not continue", async () => {
    await runAiTest("Test if not continue", async () => {
      // this is basically the same test as the one in ignore.test
      const message: Memory = {
        userId: user?.id as UUID,
        content: { text: "Bye" },
        roomId: roomId as UUID,
      };
      const handler = action.handler!;
      await populateMemories(runtime, user, roomId, [Goodbye1]);
      const result = (await handler(runtime, message)) as Content;
      return result.action === "IGNORE";
    });
  }, 60000);
  // test conditions where we would expect a wait or an ignore
});
