// 📁 app/api/rfm/interpretation/route.ts (新規作成推奨)
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log('🔗 Getting RFM interpretation from:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/rfm/interpretation`, {
      signal: AbortSignal.timeout(10000), // 10秒
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI interpretation error:', errorText);
      throw new Error(`FastAPI request failed: ${response.statusText}`);
    }

    const interpretation = await response.json();
    console.log('✅ RFM interpretation retrieved successfully');
    
    return NextResponse.json({
      success: true,
      data: interpretation,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Get RFM interpretation error:', error);
    
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        error: 'リクエストがタイムアウトしました'
      }, { status: 504 });
    }
    
    return NextResponse.json({
      error: 'RFM解釈ガイドの取得に失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}