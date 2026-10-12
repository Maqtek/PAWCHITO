// Access-токен живёт только в памяти: так его не достать через XSS из хранилища (БП §1).
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function setAccessToken(token: string | null): void {
  accessToken = token
}
