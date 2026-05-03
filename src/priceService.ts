import axios from 'axios';

export class PriceService {
  private static instance: PriceService;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  async getTokenPrice(mint: string): Promise<number> {
    const cached = this.priceCache.get(mint);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const knownTokens: { [key: string]: number } = {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1.0,
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 1.0,
        'So11111111111111111111111111111111111111112': 0,
      };

      let price = knownTokens[mint] || 0;

      if (mint === 'So11111111111111111111111111111111111111112') {
        try {
          const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
          price = response.data.solana?.usd || 0;
        } catch (error) {
          console.warn('Failed to fetch SOL price from CoinGecko, trying alternative...');
          try {
            const response = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
            price = parseFloat(response.data.price) || 0;
          } catch (binanceError) {
            console.warn('Failed to fetch SOL price from Binance, using fallback');
            price = 100;
          }
        }
      } else if (!knownTokens[mint]) {
        try {
          const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
          if (response.data.pairs && response.data.pairs.length > 0) {
            price = parseFloat(response.data.pairs[0].priceUsd) || 0;
          }
        } catch (error) {
          console.warn(`Failed to fetch price for token ${mint} from DexScreener`);
        }
      }

      this.priceCache.set(mint, { price, timestamp: Date.now() });
      return price;
    } catch (error) {
      console.error(`Failed to get price for token ${mint}:`, error);
      return 0;
    }
  }

  async getSOLPrice(): Promise<number> {
    return this.getTokenPrice('So11111111111111111111111111111111111111112');
  }
} 