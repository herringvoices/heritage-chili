import { eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { chilis, users } from "@/db/schema";
import { DomainError } from "@/server/domain-error";

type Database = ReturnType<typeof getDb>;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_CHILI_IMAGE_BYTES = 5 * 1024 * 1024;

export class ChiliImageService {
  constructor(private readonly db: Database, private readonly bucket: R2Bucket) {}

  async upload(actorUserId: number, chiliId: number, file: File) {
    const chili = await this.requireEditor(actorUserId, chiliId);
    if (!allowedTypes.has(file.type)) throw new DomainError("INVALID_IMAGE_TYPE", "Choose a JPEG, PNG, or WebP image.", 400);
    if (file.size <= 0 || file.size > MAX_CHILI_IMAGE_BYTES) throw new DomainError("INVALID_IMAGE_SIZE", "Choose an image no larger than 5 MiB.", 400);

    const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
    const objectKey = `chilis/${chiliId}/${crypto.randomUUID()}.${extension}`;
    await this.bucket.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: "private, max-age=3600" } });
    try {
      await this.db.update(chilis).set({ imageObjectKey: objectKey, updatedAt: new Date().toISOString() }).where(eq(chilis.id, chiliId));
    } catch (error) {
      try { await this.bucket.delete(objectKey); } catch { /* orphan cleanup is best effort */ }
      throw error;
    }
    if (chili.imageObjectKey) {
      try { await this.bucket.delete(chili.imageObjectKey); } catch { /* the valid new reference is retained */ }
    }
    return { imageUrl: `/api/chilis/${chiliId}/image` };
  }

  async remove(actorUserId: number, chiliId: number) {
    const chili = await this.requireEditor(actorUserId, chiliId);
    await this.db.update(chilis).set({ imageObjectKey: null, updatedAt: new Date().toISOString() }).where(eq(chilis.id, chiliId));
    if (chili.imageObjectKey) {
      try { await this.bucket.delete(chili.imageObjectKey); } catch { /* an unreachable orphan is safe to clean later */ }
    }
    return { imageUrl: null };
  }

  async getObjectForRegisteredViewer(viewerUserId: number, chiliId: number) {
    const [[viewer], [chili]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, viewerUserId)).limit(1),
      this.db.select().from(chilis).where(eq(chilis.id, chiliId)).limit(1),
    ]);
    if (!viewer?.registrationCompletedAt || !viewer.role) throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
    if (!chili?.imageObjectKey) throw new DomainError("CHILI_IMAGE_NOT_FOUND", "This chili does not have an image.", 404);
    const object = await this.bucket.get(chili.imageObjectKey);
    if (!object) throw new DomainError("CHILI_IMAGE_NOT_FOUND", "This chili image is unavailable.", 404);
    return object;
  }

  private async requireEditor(actorUserId: number, chiliId: number) {
    const [[actor], [chili]] = await Promise.all([
      this.db.select().from(users).where(eq(users.id, actorUserId)).limit(1),
      this.db.select().from(chilis).where(eq(chilis.id, chiliId)).limit(1),
    ]);
    if (!actor?.registrationCompletedAt || !actor.role) throw new DomainError("REGISTRATION_REQUIRED", "Please finish registration first.", 403);
    if (!chili) throw new DomainError("CHILI_NOT_FOUND", "That chili entry could not be found.", 404);
    if (actor.role !== "admin" && (actor.role !== "contestant" || chili.cookUserId !== actorUserId)) throw new DomainError("CHILI_EDIT_FORBIDDEN", "You may only edit your own chili entry.", 403);
    if (actor.role !== "admin" && actor.participationDisabledAt) throw new DomainError("PARTICIPATION_DISABLED", "Participation is currently disabled for this account.", 403);
    return chili;
  }
}
