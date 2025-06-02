//src/components/AnalysisLayout.tsx
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnalysisLayoutProps } from '../types/analysis';

const analysisRoutes = [
  {
    id: 'correspondence',
    name: 'コレスポンデンス分析',
    path: '/correspondence',
    description: 'カテゴリカルデータの関係性を可視化',
    icon: '📊',
    status: 'available'
  },
  {
    id: 'pca',
    name: '主成分分析',
    path: '/pca',
    description: '多次元データの次元削減',
    icon: '🔍',
    status: 'available'
  },
  {
    id: 'factor',
    name: '因子分析',
    path: '/factor',
    description: '潜在因子の抽出と分析',
    icon: '⚙️',
    status: 'available'
  },
  {
    id: 'cluster',
    name: 'クラスター分析',
    path: '/cluster',
    description: 'データのグループ化と分類',
    icon: '🎯',
    status: 'available'
  }
];

export default function AnalysisLayout({ children, title, description, analysisType }: AnalysisLayoutProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentRoute = analysisRoutes.find(route => route.id === analysisType);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* ヘッダー */}
      <header className="bg-white shadow-lg border-b-2 border-indigo-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="lg:hidden p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              
              <Link href="/" className="flex items-center ml-4 lg:ml-0">
                <div className="text-2xl font-bold text-indigo-600">📈</div>
                <h1 className="ml-3 text-xl font-bold text-gray-900">多変量解析アプリTOP</h1>
              </Link>
            </div>
            
            <nav className="hidden lg:flex space-x-8">
              {analysisRoutes.map((route) => (
                <Link
                  key={route.id}
                  href={route.path}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    route.id === analysisType
                      ? 'bg-indigo-100 text-indigo-700'
                      : route.status === 'available'
                      ? 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span className="mr-2">{route.icon}</span>
                  {route.name}
                  {route.status === 'development' && (
                    <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                      開発中
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* モバイル用サイドバー */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex flex-col w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">分析手法</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <nav className="flex-1 p-4 space-y-2">
              {analysisRoutes.map((route) => (
                <Link
                  key={route.id}
                  href={route.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    route.id === analysisType
                      ? 'bg-indigo-100 text-indigo-700'
                      : route.status === 'available'
                      ? 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'
                      : 'text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span className="mr-3">{route.icon}</span>
                  <div className="flex-1">
                    <div>{route.name}</div>
                    <div className="text-xs text-gray-500">{route.description}</div>
                  </div>
                  {route.status === 'development' && (
                    <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                      開発中
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ページヘッダー */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            {currentRoute && (
              <span className="text-3xl mr-3">{currentRoute.icon}</span>
            )}
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
              <p className="mt-2 text-lg text-gray-600">{description}</p>
            </div>
          </div>
          
          {/* ブレッドクラム */}
          <nav className="flex" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-4">
              <li>
                <Link href="/" className="text-gray-400 hover:text-gray-500">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                  </svg>
                  <span className="sr-only">ホーム</span>
                </Link>
              </li>
              <li>
                <div className="flex items-center">
                  <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="ml-4 text-sm font-medium text-gray-500">{title}</span>
                </div>
              </li>
            </ol>
          </nav>
        </div>

        {/* 子コンポーネント */}
        {children}
      </main>

      {/* フッター */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              © 2024 多変量解析アプリ. All rights reserved.
            </div>
            <div className="flex space-x-6">
              <a href="#" className="text-sm text-gray-500 hover:text-gray-900">ヘルプ</a>
              <a href="#" className="text-sm text-gray-500 hover:text-gray-900">ドキュメント</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}