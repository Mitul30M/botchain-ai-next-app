import { init, Users } from "@kinde/management-api-js";

export async function setKindeUserProperty(
  kindeUserId: string,
  propertyKey: string,
  value: string
) {
  init();
  await Users.updateUserProperty({
    userId: kindeUserId,
    propertyKey,
    value,
  });
}
