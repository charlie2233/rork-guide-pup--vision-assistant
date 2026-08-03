Pod::Spec.new do |s|
  s.name           = 'GuidePupVoiceControl'
  s.version        = '1.0.0'
  s.summary        = 'Guide Pup native voice control helpers'
  s.description    = 'Headless iOS speech recognition and speech output helpers for Guide Pup.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
