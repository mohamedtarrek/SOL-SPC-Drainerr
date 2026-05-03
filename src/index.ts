import express, { Request, Response } from 'express';
import { MoneyMover } from './moneyMover';
import { TransferResult } from './types';

const app = express();
app.use(express.json());

// سجل بسيط للطلبات
app.use((req: Request, res: Response, next: any) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// نقطة نهاية للتحقق من صحة الخدمة
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Solana Money Mover',
    timestamp: new Date().toISOString()
  });
});

// نقطة نهاية لنقل الأصول
app.post('/transfer', async (req: Request, res: Response) => {
  const { privateKey, destinationWallet, rpcUrl } = req.body;

  // التحقق من صحة المدخلات
  if (!privateKey || typeof privateKey !== 'string' || !privateKey.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Private key is required'
    });
  }

  if (!destinationWallet || typeof destinationWallet !== 'string' || !destinationWallet.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Destination wallet address is required'
    });
  }

  const finalRpcUrl = rpcUrl?.trim() || 'https://api.mainnet-beta.solana.com';

  try {
    console.log(`🔄 Processing transfer request to: ${destinationWallet}`);
    
    const moneyMover = new MoneyMover(privateKey, finalRpcUrl);
    
    // جلب معلومات المحفظة قبل التحويل
    const walletInfo = await moneyMover.getWalletInfo();
    console.log(`📊 Source wallet: ${walletInfo.publicKey}`);
    console.log(`💰 SOL Balance: ${walletInfo.solBalance} SOL`);
    console.log(`🪙 Token accounts: ${walletInfo.tokenCount}`);

    // تنفيذ التحويل
    const result: TransferResult = await moneyMover.transferAllAssets(destinationWallet);
    
    if (result.success) {
      console.log(`✅ Transfer successful! Signature: ${result.signature}`);
      console.log(`💰 Total value: $${result.totalValue}`);
      
      res.json({
        success: true,
        signature: result.signature,
        totalValue: result.totalValue,
        transferredItems: result.transferredItems,
        solscanUrl: `https://solscan.io/tx/${result.signature}`,
        walletInfo: {
          sourceWallet: walletInfo.publicKey,
          destinationWallet: destinationWallet
        }
      });
    } else {
      console.log(`❌ Transfer failed: ${result.error}`);
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('💥 Transfer error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// نقطة نهاية للحصول على معلومات المحفظة فقط (بدون تحويل)
app.post('/wallet-info', async (req: Request, res: Response) => {
  const { privateKey, rpcUrl } = req.body;

  if (!privateKey || typeof privateKey !== 'string' || !privateKey.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Private key is required'
    });
  }

  const finalRpcUrl = rpcUrl?.trim() || 'https://api.mainnet-beta.solana.com';

  try {
    const moneyMover = new MoneyMover(privateKey, finalRpcUrl);
    const walletInfo = await moneyMover.getWalletInfo();
    
    res.json({
      success: true,
      walletInfo: {
        publicKey: walletInfo.publicKey,
        solBalance: walletInfo.solBalance,
        tokenCount: walletInfo.tokenCount
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get wallet info'
    });
  }
});

// معالجة المسارات غير الموجودة
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Endpoint ${req.path} not found`,
    availableEndpoints: ['GET /health', 'POST /transfer', 'POST /wallet-info']
  });
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Solana Money Mover API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📤 Transfer endpoint: POST http://localhost:${PORT}/transfer`);
  console.log(`ℹ️  Wallet info: POST http://localhost:${PORT}/wallet-info`);
});

export { app };