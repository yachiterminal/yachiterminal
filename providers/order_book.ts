import { IAgentRuntime, Memory, Provider, State } from "../core/types.ts";
import * as fs from "fs";
import settings from "../core/settings.ts";
interface Order {
  userId: string;
  ticker: string;
  contractAddress: string;
  timestamp: string;
  buyAmount: number;
  price: number;
}
const orderbook: Provider = {
  get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    const userId = message.userId;
    // Read the order book from the JSON file
    const orderBookPath = settings.orderBookPath;
    let orderBook: Order[] = [];
    if (fs.existsSync(orderBookPath)) {
      const orderBookData = fs.readFileSync(orderBookPath, "utf-8");
      orderBook = JSON.parse(orderBookData);
    }
    // Filter the orders for the current user
    const userOrders = orderBook.filter((order) => order.userId === userId);
    let totalProfit = 0;
    for (const order of userOrders) {
      // Get the current price of the asset (replace with actual price fetching logic)
      const currentPrice = 120;
      const priceDifference = currentPrice - order.price;
      const orderProfit = priceDifference * order.buyAmount;
      totalProfit += orderProfit;
    }
    return `The user has made a total profit of $${totalProfit.toFixed(2)} for the agent based on their recorded buy orders.`;
  }
};
export default orderbook;
