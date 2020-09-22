import redis from "redis";
import { promisify } from "util";

const client = redis.createClient();

client.on("error", (error) => {
  console.error("redis error", error);
});

const wrappedRedis = redis;

const ops = ["get", "set", "hset", "hget", "hdel", "hmset", "hmget", "hsetnx"];

ops.forEach((op) => {
  wrappedRedis[op] = promisify(client[op]).bind(client);
});

export default wrappedRedis;
