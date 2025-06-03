// src/app/api/regression/methods/route.ts

import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

interface RegressionMethod {
  name: string;
  display_name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    default?: any;
    min?: number;
    max?: number;
    required?: boolean;
    description: string;
  }>;
}

interface MethodsResponse {
  methods: RegressionMethod[];
}

export async function GET(request: NextRequest): Promise<NextResponse<MethodsResponse | { error: string }>> {
  try {
    console.log('Fetching regression methods');

    const pythonUrl = new URL('/api/regression/methods', PYTHON_API_URL);

    const response = await fetch(pythonUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Python methods API error:', response.status, response.statusText);
      return NextResponse.json({
        error: '回帰分析手法一覧の取得に失敗しました'
      }, { status: response.status });
    }

    const methodsData = await response.json();
    console.log('Retrieved regression methods:', methodsData);
    
    return NextResponse.json(methodsData);

  } catch (error) {
    console.error('Regression methods API Error:', error);
    return NextResponse.json({
      error: '回帰分析手法一覧の取得中にサーバーエラーが発生しました'
    }, { status: 500 });
  }
}