import metaTokenService from './meta-token.js';

class TokenManager {
    constructor() {
        this.currentToken = null;
        this.expiresAt = null;
        this.refreshTimeout = null;
        this.isRefreshing = false;
    }

    async initialize() {
        if (!this.currentToken) {
            await this.refreshToken();
        }
        return this.currentToken;
    }

    async getCurrentToken() {
        if (!this.currentToken || this.isTokenExpired()) {
            await this.refreshToken();
        }
        return this.currentToken;
    }

    isTokenExpired() {
        return !this.expiresAt || Date.now() >= this.expiresAt - 300000; // 5 Minuten Puffer
    }

    async refreshToken() {
        if (this.isRefreshing) {
            // Warte auf den aktuellen Refresh
            while (this.isRefreshing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.currentToken;
        }

        this.isRefreshing = true;
        try {
            // Hole neuen System User Token
            const { token, expiresIn } = await metaTokenService.getSystemUserToken();
            
            // Aktualisiere Token und Ablaufzeit
            this.currentToken = token;
            this.expiresAt = Date.now() + (expiresIn * 1000);

            // Plane nächste Aktualisierung
            if (this.refreshTimeout) {
                clearTimeout(this.refreshTimeout);
            }
            
            // Maximaler Timeout ist 2147483647 (ca. 24.8 Tage)
            const MAX_TIMEOUT = 2147483647;
            // Erneuere 5 Minuten vor Ablauf
            const desiredRefreshIn = (expiresIn - 300) * 1000;
            const refreshIn = Math.min(desiredRefreshIn, MAX_TIMEOUT);
            
            this.refreshTimeout = setTimeout(() => this.refreshToken(), refreshIn);

            console.log('Token erfolgreich aktualisiert. Nächste Aktualisierung in', Math.floor(refreshIn / 1000 / 60), 'Minuten');
        } catch (error) {
            console.error('Fehler bei Token-Aktualisierung:', error);
            throw error;
        } finally {
            this.isRefreshing = false;
        }

        return this.currentToken;
    }
}

const tokenManager = new TokenManager();
export default tokenManager; 