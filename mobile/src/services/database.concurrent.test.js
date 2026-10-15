jest.mock("expo-sqlite", () => {
  const metrics = { opens: [], overlapCount: 0, active: false };
  const runExclusively = async (operation) => {
    if (metrics.active) metrics.overlapCount += 1;
    metrics.active = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return await operation();
    } finally {
      metrics.active = false;
    }
  };
  const transaction = {
    runAsync: async () => ({ changes: 1, lastInsertRowId: 1 }),
    execAsync: async () => undefined,
  };
  return {
    __metrics: metrics,
    defaultDatabaseDirectory: "/test-databases",
    openDatabaseAsync: jest.fn(async (name) => {
      metrics.opens.push(name);
      return {
        execAsync: () => runExclusively(async () => undefined),
        runAsync: () =>
          runExclusively(async () => ({ changes: 1, lastInsertRowId: 1 })),
        getAllAsync: () => runExclusively(async () => []),
        getFirstAsync: () => runExclusively(async () => null),
        withExclusiveTransactionAsync: (callback) =>
          runExclusively(() => callback(transaction)),
        closeAsync: async () => undefined,
      };
    }),
    deleteDatabaseAsync: jest.fn(async () => undefined),
  };
});

const {
  cachePosts,
  getCachedPosts,
  initializeDatabase,
} = require("./db");
const { openProfileStore } = require("../storage/profileStore");
const SQLite = require("expo-sqlite");

test("one shared SQLite connection serializes at least 50 concurrent cache reads and writes", async () => {
  await initializeDatabase();
  await openProfileStore();
  await Promise.all(
    Array.from({ length: 25 }, async (_, index) => {
      await cachePosts([{ id: `post-${index}`, value: index }]);
      await getCachedPosts();
    }),
  );

  expect(SQLite.openDatabaseAsync).toHaveBeenCalledTimes(1);
  expect(SQLite.__metrics.opens).toEqual(["quartierplus-offline.db"]);
  expect(SQLite.__metrics.overlapCount).toBe(0);
});
