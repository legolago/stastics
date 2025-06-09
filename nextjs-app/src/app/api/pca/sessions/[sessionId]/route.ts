// src/app/api/pca/sessions/[sessionId]/route.ts （修正版）
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params; // await を追加
    
    // Docker環境では python-api サービス名を使用
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    const backendUrl = `${fastApiUrl}/api/pca/sessions/${sessionId}`;
    
    console.log('🔍 Forwarding PCA session request to backend:', backendUrl);
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('📥 Backend response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FastAPI error:', errorText);
      return NextResponse.json(
        { success: false, error: 'PCAセッション詳細取得に失敗しました', details: errorText },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log('✅ PCA session detail retrieved successfully');
    
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('❌ PCA session detail API error:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        cause: error.cause,
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'PCAセッション詳細取得でエラーが発生しました', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}