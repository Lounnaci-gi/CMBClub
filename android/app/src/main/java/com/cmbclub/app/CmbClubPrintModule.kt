package com.cmbclub.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView
import android.webkit.WebViewClient
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CmbClubPrintModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "CmbClubPrint"

  @ReactMethod
  fun print(html: String, jobName: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("PRINT_NO_ACTIVITY", "Aucune activité Android n’est disponible pour imprimer.")
      return
    }

    activity.runOnUiThread {
      val webView = WebView(activity)
      var printStarted = false

      webView.webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView, url: String?) {
          if (printStarted) return
          printStarted = true

          try {
            val printManager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
            val printJob = printManager.print(
              jobName,
              view.createPrintDocumentAdapter(jobName),
              PrintAttributes.Builder().build(),
            )
            val handler = Handler(Looper.getMainLooper())
            val cleanup = object : Runnable {
              override fun run() {
                if (printJob.isCompleted || printJob.isCancelled || printJob.isFailed) {
                  view.destroy()
                  promise.resolve(null)
                } else {
                  handler.postDelayed(this, 500)
                }
              }
            }
            handler.postDelayed(cleanup, 500)
          } catch (error: Exception) {
            view.destroy()
            promise.reject("PRINT_FAILED", error)
          }
        }
      }

      webView.settings.javaScriptEnabled = false
      webView.loadDataWithBaseURL("file:///android_asset/", html, "text/HTML", "UTF-8", null)
    }
  }
}
