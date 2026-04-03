Pod::Spec.new do |s|
  s.name           = 'GuidePupNavigationCore'
  s.version        = '1.0.0'
  s.summary        = 'Guide Pup native navigation core'
  s.description    = 'Headless iOS capture, accessibility, and haptics helpers for Guide Pup.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
