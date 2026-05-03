import { 
  Connection, 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  TransactionInstruction
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount
} from '@solana/spl-token';
import { TokenInfo } from './types';
import * as bs58 from 'bs58';

export class WalletService {
  private connection: Connection;
  private wallet: Keypair;

  constructor(privateKey: string, rpcUrl: string = 'https://rpc.helius.xyz/?api-key=YOUR_API_KEY') {
    this.connection = new Connection(rpcUrl, 'confirmed');
    const privateKeyBytes = bs58.decode(privateKey);
    this.wallet = Keypair.fromSecretKey(privateKeyBytes);
  }

  getWalletPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  async getSOLBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  async getTokenAccounts(): Promise<TokenInfo[]> {
    const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
      this.wallet.publicKey,
      { programId: TOKEN_PROGRAM_ID }
    );

    const tokens: TokenInfo[] = [];
    
    for (const account of tokenAccounts.value) {
      const accountInfo = account.account.data.parsed.info;
      const mint = accountInfo.mint;
      const balance = accountInfo.tokenAmount.uiAmount;
      const decimals = accountInfo.tokenAmount.decimals;

      if (balance > 0) {
        tokens.push({
          mint,
          symbol: '',
          name: '',
          decimals,
          price: 0,
          value: 0,
          balance: balance.toString()
        });
      }
    }

    return tokens;
  }

  async estimateTransactionFee(instructionCount: number = 1, newAccountsCount: number = 0): Promise<number> {
    const baseFee = 5000; 
    const instructionFee = 5000;
    const rentExemption = 2039280; 
    
    const totalLamports = baseFee + (instructionCount * instructionFee) + (newAccountsCount * rentExemption);
    return totalLamports / LAMPORTS_PER_SOL;
  }

  async createTransferTransaction(
    destinationWallet: PublicKey,
    solAmount: number,
    tokenTransfers: Array<{ mint: string; amount: number; sourceAccount: PublicKey; decimals: number }>
  ): Promise<Transaction> {
    const transaction = new Transaction();
    
    if (solAmount > 0) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: destinationWallet,
          lamports: Math.floor(solAmount * LAMPORTS_PER_SOL)
        })
      );
    }

    for (const tokenTransfer of tokenTransfers) {
      const destinationTokenAccount = await getAssociatedTokenAddress(
        new PublicKey(tokenTransfer.mint),
        destinationWallet
      );

      let needsNewAccount = true;
      try {
        await getAccount(this.connection, destinationTokenAccount);
        needsNewAccount = false;
      } catch {
        needsNewAccount = true;
      }
      
      if (needsNewAccount) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            this.wallet.publicKey,
            destinationTokenAccount,
            destinationWallet,
            new PublicKey(tokenTransfer.mint)
          )
        );
      }

      transaction.add(
        createTransferInstruction(
          tokenTransfer.sourceAccount,
          destinationTokenAccount,
          this.wallet.publicKey,
          Math.floor(tokenTransfer.amount * Math.pow(10, tokenTransfer.decimals)) // Convert to smallest unit using correct decimals
        )
      );
    }

    return transaction;
  }

  async sendTransaction(transaction: Transaction): Promise<string> {
    const latestBlockhash = await this.connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = this.wallet.publicKey;

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.wallet]
    );

    return signature;
  }

  async getTokenAccountAddress(mint: string): Promise<PublicKey> {
    return await getAssociatedTokenAddress(
      new PublicKey(mint),
      this.wallet.publicKey
    );
  }
} 