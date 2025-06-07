// app/api/factor/methods/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log('🔗 Getting factor methods from:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/factor/methods`);

    if (!response.ok) {
      throw new Error(`FastAPI request failed: ${response.statusText}`);
    }

    const methods = await response.json();
    console.log('✅ Factor methods retrieved successfully');
    return NextResponse.json(methods);
    
  } catch (error) {
    console.error('❌ Get factor methods error:', error);
    return NextResponse.json(
      { error: 'メソッド一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}