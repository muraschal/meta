import axios from 'axios';

class MetaTokenService {
    constructor() {
        this.baseUrl = 'https://graph.facebook.com/v17.0';
        this.clientId = process.env.META_APP_ID;
        this.clientSecret = process.env.META_APP_SECRET;
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
            const response = await axios.get(`${this.baseUrl}/oauth/access_token`, {
                params: {
                    grant_type: 'client_credentials',
                    client_id: this.clientId,
                    client_secret: this.clientSecret,
                    scope: 'whatsapp_business_management'
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
            console.error('Fehler beim System User Token:', error.response?.data || error.message);
            throw error;
        }
    }
}

const metaTokenService = new MetaTokenService();
export default metaTokenService; 