const { CosmosClient } = require("@azure/cosmos");

const endpoint = process.env.COSMOS_ENDPOINT;
const key = process.env.COSMOS_KEY;
const databaseId = process.env.COSMOS_DB_NAME || "apptaskbi";

if (!endpoint || !key) {
  // Fails fast at runtime with clear error when not configured
  throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be set");
}

const client = new CosmosClient({ endpoint, key });

async function getContainer(containerId) {
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
    partitionKey: { paths: ["/id"] }
  });
  return container;
}

module.exports = {
  getContainer
};