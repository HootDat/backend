import redis from "redis";
import { promisify } from "util";

const client = redis.createClient(process.env.REDIS_URL);

client.on("error", (error) => {
  console.error("redis error", error);
});

const wrappedRedis = client;

const ops = [
  "get",
  "mget",
  "set",
  "del",
  "hset",
  "hget",
  "hdel",
  "hgetall",
  "hmset",
  "hmget",
  "hsetnx",
  "expire",
];

ops.forEach((op) => {
  wrappedRedis[op] = promisify(client[op]).bind(client);
});

wrappedRedis.executeMulti = (redisMulti) =>
  new Promise((resolve, reject) => {
    redisMulti.exec((err, replies) => {
      console.log("REDIS:", err, replies);
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
