include(FetchContent)

# 1. Pin to a stable release tag
FetchContent_Declare(
  googletest
  GIT_REPOSITORY https://github.com/google/googletest.git
  GIT_TAG        v1.15.2 
  GIT_SHALLOW    TRUE
)

# 2. Prevent GTest from overriding compiler settings on Windows
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)

# 3. Exclude GTest targets from "install" and "all" to speed up builds
FetchContent_MakeAvailable(googletest)


add_executable(codec_core_tests
  sanity_test.cpp
  image_test.cpp
  colorspace_test.cpp
  transform_test.cpp
  wavelet_test.cpp
  test_imagecodec.cpp
  test_codecanalysis.cpp
)

target_link_libraries(codec_core_tests
  PRIVATE
    codec_core
    GTest::gtest_main
)

# 4. Modern test discovery
include(GoogleTest)
gtest_discover_tests(codec_core_tests)