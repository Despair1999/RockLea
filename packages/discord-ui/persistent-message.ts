/** Durable lookup on every call also handles process restarts. Only a deleted message
 * permits recreation; permission/network errors must never produce duplicates. */
export async function persistentMessage(
  lookup: () => Promise<string | null>,
  edit: (id: string) => Promise<unknown>,
  send: () => Promise<string>,
  save: (id: string) => Promise<unknown>,
) {
  const id = await lookup();
  if (id) {
    try {
      await edit(id);
      return id;
    } catch (error) {
      if (!(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 10008
      ))
        throw error;
    }
  }
  const created = await send();
  await save(created);
  return created;
}
