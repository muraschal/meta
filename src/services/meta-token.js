import axios from 'axios';
import { META_CONFIG } from '../config/meta.js';
import { log, LOG_LEVELS } from '../utils/logger.js';

class MetaTokenService {
    constructor() {
        this.baseUrl = 'https://graph.facebook.com/v22.0';
        this.clientId = META_CONFIG.AUTH.APP_ID;
        this.clientSecret = META_CONFIG.AUTH.APP_SECRET;
        this.accessToken = META_CONFIG.AUTH.ACCESS_TOKEN;
    }

    async exchangeToLongLivedToken(shortLivedToken) {
        try {
            const response = await axios.get(`${this.baseUrl}/oauth/access_token`, {
                params: {
                    grant_type: 'fb_exchange_token',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    fb_exchange_token: shortLivedToken
                }
            });

            if (!response.data.access_token) {
                throw new Error('Kein Access Token in der Antwort');
            }

            return {
                token: response.data.access_token,
                expiresIn: response.data.expires_in || 5184000 // 60 Tage in Sekunden
            };
        } catch (error) {
            console.error('Fehler beim Token-Exchange:', error.response?.data || error.message);
            throw error;
        }
    }

    async getSystemUserToken() {
        try {
            // Verwende den permanenten Access Token aus der Konfiguration
            if (this.accessToken) {
                log(LOG_LEVELS.INFO, 'Verwende permanenten Access Token');
                return {
                    token: this.accessToken,
                    expiresIn: 5184000 // 60 Tage
                };
            }

            // Fallback: Generiere einen System User Token nur wenn kein permanenter Token vorhanden
            log(LOG_LEVELS.WARN, 'Kein permanenter Access Token konfiguriert, generiere System User Token');
            const response = await axios.get(`${this.baseUrl}/oauth/access_token`, {
                params: {
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    scope: 'whatsapp_business_messaging,whatsapp_business_management'
                }
            });

            if (!response.data.access_token) {
                throw new Error('Kein System User Token in der Antwort');
            }

            return {
                token: response.data.access_token,
                expiresIn: response.data.expires_in || 5184000
            };
        } catch (error) {
            log(LOG_LEVELS.ERROR, 'Fehler beim Token-Abruf:', error.response?.data || error.message);
            throw error;
        }
    }
}

const metaTokenService = new MetaTokenService();
export default metaTokenService; 