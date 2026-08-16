import { z } from "zod";
import { getDb } from "@/db";
import { requireAppUser } from "@/server/app-user";
import { requireAuthenticatedIdentity } from "@/server/auth/clerk";
import { errorResponse, dataResponse } from "@/server/http";
import { getRuntimeEnv } from "@/server/runtime-env";
import { ChiliImageService } from "@/server/services/chili-image-service";

async function requestContext(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  const identity = await requireAuthenticatedIdentity(request);
  const user = await requireAppUser(identity.clerkUserId);
  const chiliId = z.coerce.number().int().positive().parse((await context.params).chiliId);
  return { user, chiliId, service: new ChiliImageService(getDb(), getRuntimeEnv().BUCKET) };
}

export async function GET(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try {
    const { user, chiliId, service } = await requestContext(request, context);
    const object = await service.getObjectForRegisteredViewer(user.id, chiliId);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=3600");
    return new Response(object.body, { headers });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try {
    const { user, chiliId, service } = await requestContext(request, context);
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return Response.json({ error: { code: "IMAGE_REQUIRED", message: "Choose an image to upload." } }, { status: 400 });
    return dataResponse(await service.upload(user.id, chiliId, file));
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ chiliId: string }> }) {
  try {
    const { user, chiliId, service } = await requestContext(request, context);
    return dataResponse(await service.remove(user.id, chiliId));
  } catch (error) { return errorResponse(error); }
}
