import { log, LOG_LEVELS } from '../utils/logger.js';

export const OPENAI_CONFIG = {
  API_KEY: process.env.OPENAI_API_KEY,
  ORG_ID: process.env.OPENAI_ORG_ID,

  validate() {
    if (!this.API_KEY) {
      log(LOG_LEVELS.ERROR, 'Fehlender OPENAI_API_KEY');
      throw new Error('OPENAI_API_KEY muss konfiguriert sein');
    }
    log(LOG_LEVELS.INFO, 'OpenAI Konfiguration validiert');
  }
}; 