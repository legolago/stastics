// app/api/regression/methods/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const fastApiUrl = process.env.FASTAPI_URL || process.env.PYTHON_API_URL || 'http://python-api:8000';
    console.log('🔗 Getting regression methods from:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/regression/methods`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI methods error:', errorText);
      return NextResponse.json(
        { error: '回帰分析手法の取得に失敗しました', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('✅ Regression methods retrieved successfully');
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ Regression methods error:', error);
    return NextResponse.json(
      { 
        error: '回帰分析手法の取得中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}