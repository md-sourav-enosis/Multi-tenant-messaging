// src/services/cognitoService.ts
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || "us-east-1_mockpool",
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || "mockclientid",
  endpoint: import.meta.env.VITE_COGNITO_ENDPOINT || "http://localhost:4566",
};

export const userPool = new CognitoUserPool(poolData);

/**
 * Authenticates a user directly against Cognito/Ministack.
 * Returns the JWT access token string on success.
 */
export function loginUser(email: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const authenticationDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    // Set the authentication flow on the CognitoUser instance
    cognitoUser.setAuthenticationFlowType("USER_PASSWORD_AUTH");

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session: CognitoUserSession) => {
        const accessToken = session.getAccessToken().getJwtToken();
        localStorage.setItem("accessToken", accessToken);
        resolve(accessToken);
      },
      onFailure: (err) => {
        localStorage.removeItem("accessToken");
        reject(err);
      },
    });
  });
}

/**
 * Signs out the current user session and removes local tokens.
 */
export function logoutUser(): void {
  const currentUser = userPool.getCurrentUser();
  if (currentUser) {
    currentUser.signOut();
  }
  localStorage.removeItem("accessToken");
}