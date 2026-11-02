const { v4: uuidv4 } = require("uuid");
const { getContainer } = require("../shared/cosmosClient");

module.exports = async function (context, req) {
  const container = await getContainer("tasks");
  const id = context.bindingData.id;

  try {
    switch (req.method) {
      case "GET": {
        if (id) {
          const { resource } = await container.item(id, id).read();
          context.res = { status: 200, jsonBody: resource || null };
          return;
        }
        const { resources } = await container.items.readAll().fetchAll();
        context.res = { status: 200, jsonBody: resources };
        return;
      }
      case "POST": {
        const body = req.body || {};
        const item = {
          ...body,
          id: body.id || uuidv4(),
          createdAt: body.createdAt || new Date().toISOString()
        };
        const { resource } = await container.items.create(item);
        context.res = { status: 201, jsonBody: resource };
        return;
      }
      case "PATCH": {
        if (!id) {
          context.res = { status: 400, jsonBody: { error: "Missing id" } };
          return;
        }
        const { resource: existing } = await container.item(id, id).read();
        if (!existing) {
          context.res = { status: 404, jsonBody: { error: "Not found" } };
          return;
        }
        const updated = { ...existing, ...(req.body || {}), id };
        const { resource } = await container.items.upsert(updated);
        context.res = { status: 200, jsonBody: resource };
        return;
      }
      case "DELETE": {
        if (!id) {
          context.res = { status: 400, jsonBody: { error: "Missing id" } };
          return;
        }
        await container.item(id, id).delete();
        context.res = { status: 200, jsonBody: { ok: true } };
        return;
      }
      default:
        context.res = { status: 405, jsonBody: { error: "Method not allowed" } };
    }
  } catch (err) {
    context.res = {
      status: 500,
      jsonBody: { error: err.message || "Server error" }
    };
  }
};