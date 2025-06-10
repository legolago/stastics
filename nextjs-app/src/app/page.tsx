'use client';

import Link from 'next/link';
import { useState } from 'react';

interface AnalysisMethod {
  id: string;
  name: string;
  description: string;
  status: 'available' | 'development' | 'disabled';
  icon: React.ReactNode;
  path: string;
  features: string[];
}

export default function StatisticsHomePage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const analysisMethods: AnalysisMethod[] = [
    {
      id: 'correspondence',
      name: 'コレスポンデンス分析',
      description: 'カテゴリカルデータの関連性を視覚化し、行と列の要素間の対応関係を分析します',
      status: 'available',
      path: '/correspondence',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle cx="8" cy="8" r="2" />
          <circle cx="16" cy="12" r="2" />
          <circle cx="12" cy="16" r="2" />
          <circle cx="6" cy="16" r="2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h18v18" />
        </svg>
      ),
      features: ['二次元マッピング', '寄与率分析', '相互関連性の可視化', 'CSV出力']
    },
    {
      id: 'pca',
      name: '主成分分析（PCA）',
      description: '多変量データの次元削減を行い、主要な変動要因を特定します',
      status: 'available',
      path: '/pca',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      features: ['次元削減', '寄与率分析', 'バイプロット', '因子負荷量']
    },
    {
      id: 'factor',
      name: '因子分析',
      description: '観測変数の背後にある潜在因子を特定し、データの構造を解明します',
      status: 'available',
      path: '/factor',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      ),
      features: ['潜在因子抽出', '因子回転', '因子負荷量', '共通性分析']
    },
    {
      id: 'cluster',
      name: 'クラスター分析',
      description: 'データポイントを類似性に基づいてグループ化し、自然な分類を発見します',
      status: 'available',
      path: '/cluster',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      features: ['階層クラスター', 'k-means', 'デンドログラム', 'シルエット分析']
    },
    {
      id: 'regression',
      name: '回帰分析',
      description: '変数間の関係性をモデル化し、予測や要因分析を行います',
      status: 'available',
      path: '/available',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      ),
      features: ['線形回帰', '重回帰', '残差分析', '予測区間']
    },
    {
      id: 'rfm',
      name: 'RFM分析',
      description: '顧客をRecency（最新購入日）、Frequency（購入頻度）、Monetary（購入金額）で分析し、顧客セグメンテーションを行います',
      status: 'available',
      path: '/rfm',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="5" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="10" y="3" width="5" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="17" y="3" width="4" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="3" y="10" width="5" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="10" y="10" width="5" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="17" y="10" width="4" height="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="3" y="17" width="5" height="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="10" y="17" width="5" height="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <rect x="17" y="17" width="4" height="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </svg>
      ),
      features: ['顧客分析', 'マーケティング予測']
    },
    {
      id: 'timeseries',
      name: '時系列分析',
      description: '時間軸に沿ったデータの傾向、季節性、周期性を分析します',
      status: 'disabled',
      path: '/timeseries',
      icon: (
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      features: ['トレンド分析', '季節調整', '予測', 'ARIMA']
    }
  ];

  const categories = [
    { id: 'all', name: '全て', count: analysisMethods.length },
    { id: 'available', name: '利用可能', count: analysisMethods.filter(m => m.status === 'available').length },
    { id: 'development', name: '開発中', count: analysisMethods.filter(m => m.status === 'development').length },
    { id: 'disabled', name: '準備中', count: analysisMethods.filter(m => m.status === 'disabled').length }
  ];

  const filteredMethods = selectedCategory === 'all' 
    ? analysisMethods 
    : analysisMethods.filter(method => method.status === selectedCategory);

  const getStatusBadge = (status: string) => {
    const badges = {
      available: 'bg-green-100 text-green-800',
      development: 'bg-yellow-100 text-yellow-800',
      disabled: 'bg-gray-100 text-gray-800'
    };
    const labels = {
      available: '利用可能',
      development: '開発中',
      disabled: '準備中'
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[status as keyof typeof badges]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              AXIS統計分析プラットフォーム
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              多様な統計分析手法を簡単に実行できるWebアプリケーション。
              <br></br>
              データをアップロードして、専門的な分析を直感的に行えます。
            </p>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* カテゴリフィルター */}
        <div className="mb-8">
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                {category.name} ({category.count})
              </button>
            ))}
          </div>
        </div>

        {/* 分析手法一覧 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredMethods.map((method) => (
            <div
              key={method.id}
              className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="text-indigo-600">
                    {method.icon}
                  </div>
                  {getStatusBadge(method.status)}
                </div>
                
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {method.name}
                </h3>
                
                <p className="text-gray-600 mb-4 line-clamp-3">
                  {method.description}
                </p>
                
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">主な機能:</h4>
                  <ul className="space-y-1">
                    {method.features.map((feature, index) => (
                      <li key={index} className="text-sm text-gray-600 flex items-center">
                        <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full mr-2"></span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="pt-4 border-t border-gray-100">
                  {method.status === 'available' ? (
                    <Link
                      href={method.path}
                      className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors font-medium text-center block"
                    >
                      開始する
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="w-full bg-gray-100 text-gray-400 py-2 px-4 rounded-lg cursor-not-allowed font-medium"
                    >
                      {method.status === 'development' ? '開発中' : '準備中'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 使い方ガイド */}
        <div className="mt-16 bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
            使い方ガイド
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">1. データのアップロード</h3>
              <p className="text-gray-600">
                CSV形式のデータファイルを選択してアップロードします
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">2. 分析の実行</h3>
              <p className="text-gray-600">
                適切な分析手法を選択し、パラメータを設定して実行します
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">3. 結果の確認・保存</h3>
              <p className="text-gray-600">
                視覚化された結果を確認し、必要に応じてダウンロードします
              </p>
            </div>
          </div>
        </div>

        {/* お知らせ */}
        <div className="mt-12 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start">
            <svg className="w-6 h-6 text-yellow-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-yellow-800 mb-1">開発状況について</h3>
              <p className="text-yellow-700 text-sm">
                現在、コレスポンデンス分析のみ利用可能です。その他の分析手法は順次開発予定です。
                機能のリクエストやご要望がございましたらお知らせください。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}