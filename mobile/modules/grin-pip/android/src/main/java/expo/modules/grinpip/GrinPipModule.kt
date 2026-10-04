package expo.modules.grinpip

import android.app.PictureInPictureParams
import android.os.Build
import android.util.Rational
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class GrinPipModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GrinPip")

    Function("isSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    }

    Function("enterPictureInPicture") { width: Int, height: Int ->
      val activity = appContext.currentActivity
        ?: throw IllegalStateException("Aucune activité Android n'est disponible.")
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        return@Function false
      }
      val aspectRatio = Rational(width.coerceAtLeast(1), height.coerceAtLeast(1))
      activity.enterPictureInPictureMode(
        PictureInPictureParams.Builder()
          .setAspectRatio(aspectRatio)
          .build(),
      )
    }
  }
}
