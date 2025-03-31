import { log, LOG_LEVELS } from '../utils/logger.js';

export const META_CONFIG = {
  API: {
    VERSION: 'v22.0',
    BASE_URL: 'https://graph.facebook.com',
    PHONE_NUMBER_ID: process.env.META_PHONE_NUMBER_ID,
    BUSINESS_ACCOUNT_ID: process.env.META_BUSINESS_ACCOUNT_ID,
  },
  
  AUTH: {
    ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
    APP_ID: process.env.META_APP_ID,
    APP_SECRET: process.env.META_APP_SECRET,
  },
  
  WEBHOOK: {
    VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
  },

  validate() {
    const requiredVars = [
      ['PHONE_NUMBER_ID', this.API.PHONE_NUMBER_ID],
      ['ACCESS_TOKEN', this.AUTH.ACCESS_TOKEN],
      ['WEBHOOK_VERIFY_TOKEN', this.WEBHOOK.VERIFY_TOKEN]
    ];

    for (const [name, value] of requiredVars) {
      if (!value) {
        log(LOG_LEVELS.ERROR, `Fehlende META_${name} Konfiguration`);
        throw new Error(`META_${name} muss konfiguriert sein`);
      }
    }

    log(LOG_LEVELS.INFO, 'Meta Konfiguration validiert');
  }
}; 