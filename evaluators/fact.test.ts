import dotenv from "dotenv";
import { defaultActions } from "../core/actions.ts";
import { IAgentRuntime, type Memory, type UUID } from "../core/types.ts";
import {
  getCachedEmbeddings,
  writeCachedEmbedding,
} from "../test_resources/cache.ts";
import { zeroUuid } from "../test_resources/constants.ts";
import { createRuntime } from "../test_resources/createRuntime.ts";
import {
  GetTellMeAboutYourselfConversation1,
  GetTellMeAboutYourselfConversation2,
  GetTellMeAboutYourselfConversation3,
  jimFacts,
} from "../test_resources/data.ts";
import { getOrCreateRelationship } from "../test_resources/getOrCreateRelationship.ts";
import { populateMemories } from "../test_resources/populateMemories.ts";
import { runAiTest } from "../test_resources/runAiTest.ts";
import { type User } from "../test_resources/types.ts";
import evaluator from "./fact.ts";
dotenv.config({ path: ".dev.vars" });
describe("Facts Evaluator", () => {
  let user: User;
  let runtime: IAgentRuntime;
  let roomId = zeroUuid;
  beforeAll(async () => {
    const setup = await createRuntime({
      env: process.env as Record<string, string>,
      evaluators: [evaluator],
      actions: defaultActions,
    });
    user = setup.session.user;
    runtime = setup.runtime;
    if (!user.id) {
      throw new Error("User ID is undefined");
    }
    const data = await getOrCreateRelationship({
      runtime,
      userA: user.id as UUID,
      userB: zeroUuid,
    });
    if (!data) {
      throw new Error("Relationship not found");
    }
    roomId = data.roomId;
  });
  afterAll(async () => {
    await cleanup(runtime, user.id as UUID);
  });
  test("Extract facts from conversations", async () => {
    await runAiTest("Extract programmer and startup facts", async () => {
      await populateMemories(runtime, user, roomId, [
        GetTellMeAboutYourselfConversation1,
      ]);
      const message: Memory = {
        userId: user.id as UUID,
        content: { text: "" },
        roomId,
      };
      const result = await evaluator.handler(runtime, message);
      const resultConcatenated = result.join("\n");
      return (
        resultConcatenated.toLowerCase().includes("programmer") &&
        resultConcatenated.toLowerCase().includes("startup")
      );
    });
    await runAiTest("Extract married fact, ignoring known facts", async () => {
      await populateMemories(runtime, user, roomId, [
        GetTellMeAboutYourselfConversation2,
        GetTellMeAboutYourselfConversation3,
      ]);
      await addFacts(runtime, user.id as UUID, roomId, jimFacts);
      const message: Memory = {
        userId: user.id as UUID,
        content: { text: "" },
        roomId,
      };
      const result = await evaluator.handler(runtime, message);
      const resultConcatenated = result.join("\n");
      return (
        !resultConcatenated.toLowerCase().includes("francisco") &&
        !resultConcatenated.toLowerCase().includes("38") &&
        resultConcatenated.toLowerCase().includes("married")
      );
    });
  }, 120000); // Adjust the timeout as needed for your tests
});
async function cleanup(runtime: IAgentRuntime, roomId: UUID) {
  await runtime.factManager.removeAllMemories(roomId);
  await runtime.messageManager.removeAllMemories(roomId);
}
async function addFacts(
  runtime: IAgentRuntime,
  userId: UUID,
  roomId: UUID,
  facts: string[],
) {
  for (const fact of facts) {
    const existingEmbedding = await getCachedEmbeddings(fact);
    const bakedMemory = await runtime.factManager.addEmbeddingToMemory({
      userId: userId,
      content: { text: fact },
      roomId: roomId,
      embedding: existingEmbedding,
    });
    await runtime.factManager.createMemory(bakedMemory);
    if (!existingEmbedding) {
      writeCachedEmbedding(fact, bakedMemory.embedding as number[]);
      // Ensure there's a slight delay for asynchronous operations to complete
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}
