// src/app/api/pca/parameters/validate/route.ts
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    const backendUrl = `${process.env.BACKEND_URL || 'http://localhost:8000'}/pca/parameters/validate`;
    const queryParams = new URLSearchParams();
    
    searchParams.forEach((value, key) => {
      queryParams.append(key, value);
    });
    
    const response = await fetch(`${backendUrl}?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    return Response.json(data, { status: response.status });
  } catch (error) {
    console.error('PCA parameters validate API error:', error);
    return Response.json(
      { error: 'PCAパラメータ検証でエラーが発生しました' },
      { status: 500 }
    );
  }
}