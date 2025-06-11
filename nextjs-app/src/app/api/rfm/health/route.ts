// 📁 app/api/rfm/health/route.ts (ヘルスチェック用)
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log('🔗 Health check for RFM API:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/health`, {
      signal: AbortSignal.timeout(5000), // 5秒
    });

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    const healthData = await response.json();
    console.log('✅ RFM API health check successful');
    
    return NextResponse.json({
      status: 'healthy',
      rfm_api_status: healthData,
      timestamp: new Date().toISOString(),
      environment: {
        fastapi_url: fastApiUrl,
        node_env: process.env.NODE_ENV,
      }
    });
    
  } catch (error) {
    console.error('❌ RFM API health check failed:', error);
    
    return NextResponse.json({
      status: 'unhealthy',
      error: 'RFM APIとの接続に失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
