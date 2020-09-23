import redis from "redis";
import { promisify } from "util";

const client = redis.createClient();

client.on("error", (error) => {
  console.error("redis error", error);
});

const wrappedRedis = client;

const ops = [
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

wrappedRedis.executeMulti = (redisMulti) =>
  new Promise((resolve, reject) => {
    redisMulti.exec((err, replies) => {
      if (err) return reject(err);
      return resolve(replies);
    });
  });

export default wrappedRedis;

// for testing, pls ignore
// const testFn = async () => {
//   const testMulti = wrappedRedis.multi();
//   testMulti.hgetall("game-539144");
//   testMulti.hgetall("user-abc123");
//   testMulti.hgetall("user-testing1");
//   const res = await executeMulti(testMulti);
//   console.log(res);
// };

// testFn();
