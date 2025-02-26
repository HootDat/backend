const randomIntFromInterval = (start: number, end: number): number => {
  return Math.floor(Math.random() * (end - start + 1) + start);
};

export { randomIntFromInterval };
