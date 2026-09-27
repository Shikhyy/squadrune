class Squadrune < Formula
  desc "Parallel Multi-Agent Code Verification Layer for Developers & AI Agents"
  homepage "https://github.com/squadrune/squadrune"
  url "https://registry.npmjs.org/squadrune/-/squadrune-1.0.0.tgz"
  sha256 "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "SQUADRUNE", shell_output("#{bin}/squadrune doctor")
  end
end
