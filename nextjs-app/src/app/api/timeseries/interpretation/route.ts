// app/api/timeseries/interpretation/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const fastApiUrl = process.env.FASTAPI_URL || process.env.PYTHON_API_URL || 'http://python-api:8000';
    console.log('🔗 Getting timeseries interpretation guide from:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/timeseries/interpretation`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI interpretation error:', errorText);
      return NextResponse.json(
        { error: '時系列分析解釈ガイドの取得に失敗しました', details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();
    console.log('✅ Timeseries interpretation guide retrieved successfully');
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ Timeseries interpretation error:', error);
    return NextResponse.json(
      { 
        error: '時系列分析解釈ガイドの取得中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}