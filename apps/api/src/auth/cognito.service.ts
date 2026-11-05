import {
  BadRequestException, ConflictException, HttpException, Injectable, Logger,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CognitoIdentityProviderClient, SignUpCommand, ConfirmSignUpCommand,
  ResendConfirmationCodeCommand, InitiateAuthCommand, GetUserCommand,
  ForgotPasswordCommand, ConfirmForgotPasswordCommand, GetTokensFromRefreshTokenCommand,
  RevokeTokenCommand, GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AuthenticationResultType } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import {
  CognitoJwtInvalidClientIdError, CognitoJwtInvalidTokenUseError, JwtInvalidClaimError,
  JwtInvalidSignatureAlgorithmError, JwtInvalidSignatureError, JwtParseError,
  JwtWithoutValidKidError, KidNotFoundInJwksError,
} from 'aws-jwt-verify/error';

export type CognitoTokens = { token: string; refreshToken: string; expiresIn: number };

@Injectable()
export class CognitoService {
  private readonly logger = new Logger(CognitoService.name);
  private client?: CognitoIdentityProviderClient;
  private verifier?: ReturnType<typeof CognitoJwtVerifier.create>;

  constructor(private readonly config: ConfigService) {}

  private settings() {
    const userPoolId = this.config.get<string>('COGNITO_USER_POOL_ID');
    const clientId = this.config.get<string>('COGNITO_CLIENT_ID');
    if (!userPoolId || !clientId) {
      throw new ServiceUnavailableException('Sign-in is not configured. Configure the Cognito user pool and app client on the API.');
    }
    this.client ??= new CognitoIdentityProviderClient({
      region: userPoolId.split('_')[0], maxAttempts: 2,
    });
    this.verifier ??= CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' });
    return { client: this.client, verifier: this.verifier, clientId };
  }

  private async invoke<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
      const name = error instanceof Error ? error.name : 'UnknownError';
      switch (name) {
        case 'NotAuthorizedException':
        case 'UserNotFoundException':
          throw new UnauthorizedException('Invalid sign-in details or expired session. Existing users should use Create / Migrate Account, then verify their email.');
        case 'UsernameExistsException':
          throw new ConflictException('An account already exists. Sign in, resend the confirmation code, or reset your password.');
        case 'UserNotConfirmedException':
          throw new ConflictException('Verify your email first. Use Resend Confirmation Code if needed.');
        case 'CodeMismatchException':
        case 'ExpiredCodeException':
          throw new BadRequestException('The code is incorrect or expired. Request a new code and try again.');
        case 'InvalidPasswordException':
          throw new BadRequestException('Use at least 8 characters, including uppercase, lowercase, a number, and a symbol.');
        case 'LimitExceededException':
        case 'TooManyRequestsException':
          throw new HttpException('Too many attempts. Please wait before trying again.', 429);
        case 'PasswordResetRequiredException':
          throw new ConflictException('Reset your password before signing in.');
        default:
          // Do not log SDK messages: they can contain email addresses or request data.
          this.logger.error(`Cognito operation failed (${name}).`);
          throw new ServiceUnavailableException('Authentication is temporarily unavailable. Please try again or contact support.');
      }
    }
  }

  async register(email: string, password: string, name: string) {
    const { client, clientId } = this.settings();
    await this.invoke(() => client.send(new SignUpCommand({
      ClientId: clientId, Username: email, Password: password,
      UserAttributes: [{ Name: 'email', Value: email }, { Name: 'name', Value: name }],
    })));
    return { requiresConfirmation: true, message: 'Check your email for a confirmation code, then sign in.' };
  }

  async confirm(email: string, code: string) {
    const { client, clientId } = this.settings();
    await this.invoke(() => client.send(new ConfirmSignUpCommand({
      ClientId: clientId, Username: email, ConfirmationCode: code,
      ForceAliasCreation: false,
    })));
    return { message: 'Email verified. You can now sign in.' };
  }

  async resend(email: string) {
    const { client, clientId } = this.settings();
    await this.invoke(() => client.send(new ResendConfirmationCodeCommand({ ClientId: clientId, Username: email })));
    return { message: 'If confirmation is available for this address, a code has been sent.' };
  }

  async login(email: string, password: string) {
    const { client, clientId } = this.settings();
    const response = await this.invoke(() => client.send(new InitiateAuthCommand({
      ClientId: clientId, AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    })));
    if (response.ChallengeName) {
      throw new ConflictException('This account requires an authentication challenge not supported by this client. Contact support.');
    }
    return this.tokens(response.AuthenticationResult);
  }

  async refresh(refreshToken: string) {
    const { client, clientId } = this.settings();
    const response = await this.invoke(() => client.send(new GetTokensFromRefreshTokenCommand({
      ClientId: clientId, RefreshToken: refreshToken,
    })));
    return this.tokens(response.AuthenticationResult);
  }

  private tokens(result?: AuthenticationResultType): CognitoTokens {
    if (!result?.AccessToken || !result.ExpiresIn || !result.RefreshToken) {
      throw new ServiceUnavailableException('The identity provider did not return a complete session.');
    }
    return {
      token: result.AccessToken, refreshToken: result.RefreshToken,
      expiresIn: result.ExpiresIn,
    };
  }

  async identity(token: string) {
    const { client, verifier } = this.settings();
    let subject: string;
    try { subject = (await verifier.verify(token)).sub; }
    catch (error) {
      if (error instanceof JwtInvalidClaimError || error instanceof JwtInvalidSignatureError ||
          error instanceof JwtInvalidSignatureAlgorithmError || error instanceof JwtParseError ||
          error instanceof JwtWithoutValidKidError || error instanceof KidNotFoundInJwksError ||
          error instanceof CognitoJwtInvalidClientIdError || error instanceof CognitoJwtInvalidTokenUseError) {
        throw new UnauthorizedException('The access token is invalid or expired.');
      }
      this.logger.error('Could not obtain Cognito signing keys.');
      throw new ServiceUnavailableException('Token verification is temporarily unavailable.');
    }
    // Signature-only verification cannot detect Cognito token revocation.
    const user = await this.invoke(() => client.send(new GetUserCommand({ AccessToken: token })));
    const attribute = (name: string) => user.UserAttributes?.find((value) => value.Name === name)?.Value;
    const email = attribute('email');
    if (attribute('sub') !== subject || attribute('email_verified') !== 'true' || !email) {
      throw new UnauthorizedException('A verified email address is required.');
    }
    return { sub: subject, email: email.toLowerCase(), name: attribute('name') || email };
  }

  async forgotPassword(email: string) {
    const { client, clientId } = this.settings();
    try {
      await client.send(new ForgotPasswordCommand({ ClientId: clientId, Username: email }));
    } catch (error) {
      if (!(error instanceof Error) || !['UserNotFoundException', 'InvalidParameterException'].includes(error.name)) {
        await this.invoke(async () => { throw error; });
      }
      // These cases intentionally have the same response to avoid account enumeration.
    }
    return { message: 'If the account can be recovered, an email code has been sent. If you have not migrated your old account, use Create / Migrate Account first.' };
  }

  async resetPassword(email: string, code: string, password: string) {
    const { client, clientId } = this.settings();
    await this.invoke(() => client.send(new ConfirmForgotPasswordCommand({
      ClientId: clientId, Username: email, ConfirmationCode: code, Password: password,
    })));
    return { message: 'Password changed. Sign in with your new password.' };
  }

  async logout(refreshToken: string, accessToken?: string) {
    const { client, clientId } = this.settings();
    if (accessToken) {
      try { await client.send(new GlobalSignOutCommand({ AccessToken: accessToken })); }
      catch (error) {
        if (!(error instanceof Error) || error.name !== 'NotAuthorizedException') {
          await this.invoke(async () => { throw error; });
        }
      }
    }
    await this.invoke(() => client.send(new RevokeTokenCommand({ ClientId: clientId, Token: refreshToken })));
  }
}
