import { PublicKey } from '@solana/web3.js';
import { WalletService } from './walletService';
import { PriceService } from './priceService';
import { TransferResult, TransferItem, TokenInfo } from './types';

export class MoneyMover {
  private walletService: WalletService;
  private priceService: PriceService;
  private readonly MIN_VALUE_THRESHOLD = 5; // $5 minimum value

  constructor(privateKey: string, rpcUrl?: string) {
    this.walletService = new WalletService(privateKey, rpcUrl);
    this.priceService = PriceService.getInstance();
  }

  async transferAllAssets(destinationWallet: string): Promise<TransferResult> {
    try {
      console.log('Starting asset transfer process...');
      
      const destinationPubkey = new PublicKey(destinationWallet);
      
      const solBalance = await this.walletService.getSOLBalance();
      console.log(`Current SOL balance: ${solBalance} SOL`);
      
      const tokenAccounts = await this.walletService.getTokenAccounts();
      console.log(`Found ${tokenAccounts.length} token accounts`);
      
      const solPrice = await this.priceService.getSOLPrice();
      console.log(`Current SOL price: $${solPrice}`);
      
      const solValue = solBalance * solPrice;
      console.log(`SOL value: $${solValue.toFixed(2)}`);
      
      const processedTokens: TokenInfo[] = [];
      for (const token of tokenAccounts) {
        const price = await this.priceService.getTokenPrice(token.mint);
        const value = parseFloat(token.balance) * price;
        
        processedTokens.push({
          ...token,
          price,
          value
        });
        
        console.log(`Token ${token.mint}: ${token.balance} tokens = $${value.toFixed(2)}`);
      }
      
      const valuableTokens = processedTokens.filter(token => token.value >= this.MIN_VALUE_THRESHOLD);
      let shouldTransferSOL = solValue >= this.MIN_VALUE_THRESHOLD;
      
      console.log(`Found ${valuableTokens.length} tokens worth >= $${this.MIN_VALUE_THRESHOLD}`);
      console.log(`SOL transfer needed: ${shouldTransferSOL}`);
      
      if (valuableTokens.length === 0 && !shouldTransferSOL) {
        return {
          success: false,
          error: 'No assets found worth more than $5',
          transferredItems: [],
          totalValue: 0
        };
      }
      
      const totalInstructions = valuableTokens.length * 2 + (shouldTransferSOL ? 1 : 0);
      const newAccountsCount = valuableTokens.length;
      
      const estimatedFee = await this.walletService.estimateTransactionFee(totalInstructions, newAccountsCount);
      console.log(`Estimated transaction fee: ${estimatedFee} SOL (${totalInstructions} instructions, ${newAccountsCount} new accounts)`);
      
      let finalSolAmount = 0;
      const feeReserve = estimatedFee * 1.2;
      
      if (shouldTransferSOL) {
        finalSolAmount = Math.max(0, solBalance - feeReserve);
      }
      
      if (solBalance < feeReserve) {
        return {
          success: false,
          error: `Insufficient SOL to cover transaction fees and rent exemption. Need at least ${feeReserve.toFixed(6)} SOL, have ${solBalance.toFixed(6)} SOL`,
          transferredItems: [],
          totalValue: 0
        };
      }
      
      if (solBalance < feeReserve + 0.001) {
        console.log('Warning: Very low SOL balance. Only transferring tokens, not SOL.');
        shouldTransferSOL = false;
        finalSolAmount = 0;
      }
      
      const tokenTransfers: Array<{ mint: string; amount: number; sourceAccount: PublicKey; decimals: number }> = [];
      const transferredItems: TransferItem[] = [];
      
      for (const token of valuableTokens) {
        const sourceAccount = await this.walletService.getTokenAccountAddress(token.mint);
        tokenTransfers.push({
          mint: token.mint,
          amount: parseFloat(token.balance),
          sourceAccount,
          decimals: token.decimals
        });
        
        transferredItems.push({
          type: 'TOKEN',
          amount: parseFloat(token.balance),
          mint: token.mint,
          value: token.value
        });
      }
      
      if (shouldTransferSOL && finalSolAmount > 0) {
        transferredItems.push({
          type: 'SOL',
          amount: finalSolAmount,
          value: finalSolAmount * solPrice
        });
      }
      
      const transaction = await this.walletService.createTransferTransaction(
        destinationPubkey,
        finalSolAmount,
        tokenTransfers
      );
      
      console.log('Sending transaction...');
      const signature = await this.walletService.sendTransaction(transaction);
      
      const totalValue = transferredItems.reduce((sum, item) => sum + item.value, 0);
      
      console.log(`Transaction successful! Signature: ${signature}`);
      console.log(`Total value transferred: $${totalValue.toFixed(2)}`);
      
      return {
        success: true,
        signature,
        transferredItems,
        totalValue
      };
      
    } catch (error) {
      console.error('Transfer failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        transferredItems: [],
        totalValue: 0
      };
    }
  }
  
  async getWalletInfo(): Promise<{
    publicKey: string;
    solBalance: number;
    tokenCount: number;
  }> {
    const publicKey = this.walletService.getWalletPublicKey().toString();
    const solBalance = await this.walletService.getSOLBalance();
    const tokenAccounts = await this.walletService.getTokenAccounts();
    
    return {
      publicKey,
      solBalance,
      tokenCount: tokenAccounts.length
    };
  }

  // دالة تقدير قيمة الأصول قبل التحويل (مضافة جديدة)
  async getTransferEstimate(): Promise<{
    solBalance: number;
    solValue: number;
    tokens: Array<{
      mint: string;
      balance: string;
      value: number;
      price: number;
    }>;
    totalValue: number;
    estimatedFee: number;
    itemsToTransfer: number;
  }> {
    try {
      const solBalance = await this.walletService.getSOLBalance();
      const solPrice = await this.priceService.getSOLPrice();
      const solValue = solBalance * solPrice;
      
      const tokenAccounts = await this.walletService.getTokenAccounts();
      const tokensWithValues = [];
      let totalTokenValue = 0;
      
      for (const token of tokenAccounts) {
        const price = await this.priceService.getTokenPrice(token.mint);
        const value = parseFloat(token.balance) * price;
        
        tokensWithValues.push({
          mint: token.mint,
          balance: token.balance,
          value: value,
          price: price
        });
        
        if (value >= this.MIN_VALUE_THRESHOLD) {
          totalTokenValue += value;
        }
      }
      
      const valuableTokens = tokensWithValues.filter(t => t.value >= this.MIN_VALUE_THRESHOLD);
      const shouldTransferSOL = solValue >= this.MIN_VALUE_THRESHOLD;
      
      const totalInstructions = valuableTokens.length * 2 + (shouldTransferSOL ? 1 : 0);
      const newAccountsCount = valuableTokens.length;
      const estimatedFee = await this.walletService.estimateTransactionFee(totalInstructions, newAccountsCount);
      
      const totalValue = (shouldTransferSOL ? solValue : 0) + totalTokenValue;
      const itemsToTransfer = valuableTokens.length + (shouldTransferSOL ? 1 : 0);
      
      return {
        solBalance,
        solValue,
        tokens: tokensWithValues,
        totalValue,
        estimatedFee,
        itemsToTransfer
      };
      
    } catch (error) {
      console.error('Failed to get transfer estimate:', error);
      throw error;
    }
  }

  // دالة لحساب القيمة الإجمالية (مساعدة)
  async calculateTotalValue(): Promise<number> {
    const solBalance = await this.walletService.getSOLBalance();
    const solPrice = await this.priceService.getSOLPrice();
    const solValue = solBalance * solPrice;
    
    const tokenAccounts = await this.walletService.getTokenAccounts();
    let tokenValue = 0;
    
    for (const token of tokenAccounts) {
      const price = await this.priceService.getTokenPrice(token.mint);
      const value = parseFloat(token.balance) * price;
      if (value >= this.MIN_VALUE_THRESHOLD) {
        tokenValue += value;
      }
    }
    
    return solValue + tokenValue;
  }
}