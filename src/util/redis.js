import redis from "redis";
import { promisify } from "util";

const client = redis.createClient();

client.on("error", (error) => {
  console.error("redis error", error);
});

const wrappedRedis = client;

const ops = [
  "exec", // idk if this will work
  "get",
  "mget",
  "set",
  "hset",
  "hget",
  "hdel",
  "hgetall",
  "hmset",
  "hmget",
  "hsetnx",
];

ops.forEach((op) => {
  wrappedRedis[op] = promisify(client[op]).bind(client);
});

export default wrappedRedis;

const testFn = async () => {
  const testMulti = wrappedRedis.multi();
  testMulti.get("1");
  testMulti.get("2");
  testMulti.get("3");
  testMulti.exec((err, replies) => {
    console.log("err", err);
    console.log("replies", replies);
  });
};

testFn();
