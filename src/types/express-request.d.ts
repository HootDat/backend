declare namespace Express {
  interface JsonWebToken {
    userID: number;
  }
  interface Request {
    jwt?: JsonWebToken;
  }
}
