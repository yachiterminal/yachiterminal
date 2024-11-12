import { IAgentRuntime, Memory, Provider, State } from "../core/types.ts";
const time: Provider = {
  get: async (_runtime: IAgentRuntime, _message: Memory, _state?: State) => {
    const currentDate = new Date();
    const currentTime = currentDate.toLocaleTimeString("en-US");
    const currentYear = currentDate.getFullYear();
    return `The current time is: ${currentTime}, ${currentYear}`;
  },
};
export default time;
