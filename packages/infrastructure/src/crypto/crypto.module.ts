import { Module } from '@nestjs/common';
import { SECRET_CIPHER } from '@runlane/application';
import { RunlaneConfigModule } from '@runlane/config';
import { AesGcmSecretCipher } from './aes-gcm-secret-cipher';

@Module({
  imports: [RunlaneConfigModule],
  providers: [
    AesGcmSecretCipher,
    {
      provide: SECRET_CIPHER,
      useExisting: AesGcmSecretCipher,
    },
  ],
  exports: [SECRET_CIPHER],
})
export class RunlaneCryptoModule {}
