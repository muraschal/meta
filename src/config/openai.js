import { log, LOG_LEVELS } from '../utils/logger.js';

export const OPENAI_CONFIG = {
  API_KEY: process.env.OPENAI_API_KEY,
  ORG_ID: process.env.OPENAI_ORG_ID,

  validate() {
    const requiredVars = [
      ['API_KEY', this.API_KEY],
      ['ORG_ID', this.ORG_ID]
    ];

    for (const [name, value] of requiredVars) {
      if (!value) {
        log(LOG_LEVELS.ERROR, `Fehlender OPENAI_${name}`);
        throw new Error(`OPENAI_${name} muss konfiguriert sein`);
      }
    }
    
    log(LOG_LEVELS.INFO, 'OpenAI Konfiguration validiert');
  }
}; 