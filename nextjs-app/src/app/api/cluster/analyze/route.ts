//src/app/api/cluster/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://python-api:8000';

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    // フォームデータの取得
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'ファイルが提供されていません' },
        { status: 400 }
      );
    }

    // リクエストパラメータのログ出力
    console.log('Received Cluster Analysis request parameters:', {
      session_name: searchParams.get('session_name'),
      description: searchParams.get('description'),
      tags: searchParams.get('tags'),
      user_id: searchParams.get('user_id'),
      method: searchParams.get('method'),
      n_clusters: searchParams.get('n_clusters'),
      standardize: searchParams.get('standardize'),
      linkage: searchParams.get('linkage'),
      eps: searchParams.get('eps'),
      min_samples: searchParams.get('min_samples')
    });

    // ファイル情報のログ出力
    const fileName = file.name;
    console.log('Cluster Analysis File info:', {
      name: fileName,
      size: file.size,
      type: file.type,
      lastModified: (file as any).lastModified ? new Date((file as any).lastModified).toISOString() : 'unknown'
    });

    // Python APIに転送するためのFormDataを作成
    const pythonFormData = new FormData();
    pythonFormData.append('file', file);
    
    // 全てのパラメータをFormDataに追加
    pythonFormData.append('session_name', searchParams.get('session_name') || '');
    pythonFormData.append('description', searchParams.get('description') || '');
    pythonFormData.append('tags', searchParams.get('tags') || '');
    pythonFormData.append('user_id', searchParams.get('user_id') || 'default');
    pythonFormData.append('method', searchParams.get('method') || 'kmeans');
    pythonFormData.append('standardize', searchParams.get('standardize') || 'true');
    
    // 手法別パラメータの追加
    const method = searchParams.get('method') || 'kmeans';
    
    if (method === 'kmeans' || method === 'hierarchical') {
      pythonFormData.append('n_clusters', searchParams.get('n_clusters') || '3');
    }
    
    if (method === 'hierarchical') {
      pythonFormData.append('linkage', searchParams.get('linkage') || 'ward');
    }
    
    if (method === 'dbscan') {
      pythonFormData.append('eps', searchParams.get('eps') || '0.5');
      pythonFormData.append('min_samples', searchParams.get('min_samples') || '5');
    }

    // Python APIエンドポイントの構築（クエリパラメータなし）
    const pythonUrl = `${PYTHON_API_URL}/cluster/analyze`;
    console.log('Calling Python Cluster Analysis API:', pythonUrl);

    // Python APIを呼び出し
    const pythonResponse = await fetch(pythonUrl, {
      method: 'POST',
      body: pythonFormData,
    });

    if (!pythonResponse.ok) {
      const errorData = await pythonResponse.json().catch(() => ({ detail: 'Unknown error' }));
      console.log('Python Cluster Analysis API Error:', {
        status: pythonResponse.status,
        statusText: pythonResponse.statusText,
        data: errorData
      });
      
      return NextResponse.json(
        { 
          error: 'Python APIでエラーが発生しました', 
          details: errorData,
          status: pythonResponse.status 
        },
        { status: pythonResponse.status }
      );
    }

    // Python APIからのレスポンスを取得
    const responseData = await pythonResponse.json();
    
    console.log('Cluster Analysis completed successfully:', {
      session_id: responseData.session_id,
      analysis_type: responseData.analysis_type,
      has_plot: !!responseData.data?.plot_image,
      method: responseData.data?.method,
      n_clusters: responseData.data?.n_clusters
    });

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Cluster Analysis API Error:', error);
    return NextResponse.json(
      { 
        error: 'クラスター分析処理中にエラーが発生しました',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// 利用可能なクラスタリング手法を取得
export async function GET() {
  try {
    // フォールバック: 手法情報を直接返す
    return NextResponse.json({
      methods: [
        {
          value: "kmeans",
          label: "K-means法",
          description: "事前にクラスター数を指定する分割クラスタリング",
          parameters: ["n_clusters"]
        },
        {
          value: "hierarchical",
          label: "階層クラスタリング",
          description: "サンプル間の距離に基づく階層的なクラスタリング",
          parameters: ["n_clusters", "linkage"]
        },
        {
          value: "dbscan",
          label: "DBSCAN法",
          description: "密度ベースのクラスタリング（ノイズ検出可能）",
          parameters: ["eps", "min_samples"]
        }
      ],
      linkage_methods: [
        {"value": "ward", "label": "Ward法"},
        {"value": "complete", "label": "完全結合法"},
        {"value": "average", "label": "平均結合法"},
        {"value": "single", "label": "単一結合法"}
      ]
    });
  } catch (error) {
    console.error('Methods retrieval error:', error);
    return NextResponse.json(
      { error: '手法情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}