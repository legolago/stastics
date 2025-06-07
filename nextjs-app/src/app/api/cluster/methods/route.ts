// app/api/cluster/methods/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log('🔗 Getting cluster methods from:', fastApiUrl);
    
    const response = await fetch(`${fastApiUrl}/api/cluster/methods`);

    if (!response.ok) {
      throw new Error(`FastAPI request failed: ${response.statusText}`);
    }

    const methods = await response.json();
    console.log('✅ Cluster methods retrieved successfully');
    return NextResponse.json(methods);
    
  } catch (error) {
    console.error('❌ Get cluster methods error:', error);
    return NextResponse.json(
      { error: 'メソッド一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}